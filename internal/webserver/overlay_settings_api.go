package webserver

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"fmt"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/shared/paths"
	"go.uber.org/zap"
)

// OverlaySettings represents the overlay display settings
type OverlaySettings struct {
	// 音楽プレイヤー設定
	MusicEnabled  bool    `json:"music_enabled"`
	MusicPlaylist *string `json:"music_playlist"`
	MusicVolume   int     `json:"music_volume"`
	MusicAutoPlay bool    `json:"music_auto_play"`

	// FAX表示設定
	FaxEnabled        bool    `json:"fax_enabled"`
	FaxAnimationSpeed float64 `json:"fax_animation_speed"`
	FaxImageType      string  `json:"fax_image_type"` // "mono" or "color"

	// 時計表示設定
	ClockEnabled    bool   `json:"clock_enabled"`
	ClockFormat     string `json:"clock_format"` // "12h" or "24h"
	ClockShowIcons  bool   `json:"clock_show_icons"`
	LocationEnabled bool   `json:"location_enabled"`
	DateEnabled     bool   `json:"date_enabled"`
	TimeEnabled     bool   `json:"time_enabled"`

	// その他の表示設定
	ShowDebugInfo bool `json:"show_debug_info"`
	
	// 開発者設定
	DebugEnabled bool `json:"debug_enabled"`

	UpdatedAt time.Time `json:"updated_at"`
}

var (
	currentOverlaySettings *OverlaySettings
	overlaySettingsMutex   sync.RWMutex

	// SSE clients for settings updates
	settingsEventClients   = make(map[chan string]bool)
	settingsEventClientsMu sync.RWMutex
)

// InitOverlaySettings initializes the overlay settings from database
func InitOverlaySettings() {
	// まず、既存のJSONファイルから移行を試みる
	migrateFromJSONIfExists()

	// データベースから設定を読み込む
	loadOverlaySettingsFromDB()
}

// loadOverlaySettingsFromDB loads overlay settings from database
func loadOverlaySettingsFromDB() {
	// データベース接続を取得
	db, err := localdb.SetupDB(paths.GetDBPath())
	if err != nil {
		logger.Error("Failed to setup database for overlay settings", zap.Error(err))
		useDefaultSettings()
		return
	}

	settingsManager := settings.NewSettingsManager(db)
	allSettings, err := settingsManager.GetAllSettings()
	if err != nil {
		logger.Error("Failed to get overlay settings from database", zap.Error(err))
		useDefaultSettings()
		return
	}

	// データベースから設定を読み込んでOverlaySettings構造体に変換
	overlaySettings := &OverlaySettings{
		MusicEnabled:      getBoolSetting(allSettings, "MUSIC_ENABLED", true),
		MusicPlaylist:     getStringSetting(allSettings, "MUSIC_PLAYLIST"),
		MusicVolume:       getIntSetting(allSettings, "MUSIC_VOLUME", 70),
		MusicAutoPlay:     getBoolSetting(allSettings, "MUSIC_AUTO_PLAY", false),
		FaxEnabled:        getBoolSetting(allSettings, "FAX_ENABLED", true),
		FaxAnimationSpeed: getFloatSetting(allSettings, "FAX_ANIMATION_SPEED", 1.0),
		FaxImageType:      getStringSettingWithDefault(allSettings, "FAX_IMAGE_TYPE", "color"),
		ClockEnabled:      getBoolSetting(allSettings, "OVERLAY_CLOCK_ENABLED", true),
		ClockFormat:       getStringSettingWithDefault(allSettings, "OVERLAY_CLOCK_FORMAT", "24h"),
		ClockShowIcons:    getBoolSetting(allSettings, "CLOCK_SHOW_ICONS", true),
		LocationEnabled:   getBoolSetting(allSettings, "OVERLAY_LOCATION_ENABLED", true),
		DateEnabled:       getBoolSetting(allSettings, "OVERLAY_DATE_ENABLED", true),
		TimeEnabled:       getBoolSetting(allSettings, "OVERLAY_TIME_ENABLED", true),
		ShowDebugInfo:     false, // 廃止予定
		DebugEnabled:      getBoolSetting(allSettings, "OVERLAY_DEBUG_ENABLED", false),
		UpdatedAt:         time.Now(),
	}

	overlaySettingsMutex.Lock()
	currentOverlaySettings = overlaySettings
	overlaySettingsMutex.Unlock()

	logger.Info("Loaded overlay settings from database",
		zap.Bool("music_enabled", overlaySettings.MusicEnabled),
		zap.Bool("fax_enabled", overlaySettings.FaxEnabled),
		zap.Bool("clock_enabled", overlaySettings.ClockEnabled))
}

// Helper functions for getting settings with defaults
func getBoolSetting(settings map[string]settings.Setting, key string, defaultValue bool) bool {
	if setting, ok := settings[key]; ok && setting.Value != "" {
		return setting.Value == "true"
	}
	return defaultValue
}

func getIntSetting(settings map[string]settings.Setting, key string, defaultValue int) int {
	if setting, ok := settings[key]; ok && setting.Value != "" {
		if val, err := strconv.Atoi(setting.Value); err == nil {
			return val
		}
	}
	return defaultValue
}

func getFloatSetting(settings map[string]settings.Setting, key string, defaultValue float64) float64 {
	if setting, ok := settings[key]; ok && setting.Value != "" {
		if val, err := strconv.ParseFloat(setting.Value, 64); err == nil {
			return val
		}
	}
	return defaultValue
}

func getStringSetting(settings map[string]settings.Setting, key string) *string {
	if setting, ok := settings[key]; ok && setting.Value != "" {
		return &setting.Value
	}
	return nil
}

func getStringSettingWithDefault(settings map[string]settings.Setting, key string, defaultValue string) string {
	if setting, ok := settings[key]; ok && setting.Value != "" {
		return setting.Value
	}
	return defaultValue
}

func useDefaultSettings() {
	defaultSettings := &OverlaySettings{
		MusicEnabled:      true,
		MusicPlaylist:     nil,
		MusicVolume:       70,
		MusicAutoPlay:     false,
		FaxEnabled:        true,
		FaxAnimationSpeed: 1.0,
		FaxImageType:      "color",
		ClockEnabled:      true,
		ClockFormat:       "24h",
		ClockShowIcons:    true,
		LocationEnabled:   true,
		DateEnabled:       true,
		TimeEnabled:       true,
		ShowDebugInfo:     false,
		DebugEnabled:      false,
		UpdatedAt:         time.Now(),
	}

	overlaySettingsMutex.Lock()
	currentOverlaySettings = defaultSettings
	overlaySettingsMutex.Unlock()
}

// migrateFromJSONIfExists migrates settings from JSON file if it exists
func migrateFromJSONIfExists() {
	// 古いJSONファイルのパス（相対パスと絶対パスの両方を試す）
	possiblePaths := []string{
		"data/overlay_settings.json",
		filepath.Join(paths.GetDataDir(), "overlay_settings.json"),
	}

	for _, jsonPath := range possiblePaths {
		if data, err := os.ReadFile(jsonPath); err == nil {
			var settings OverlaySettings
			if err := json.Unmarshal(data, &settings); err == nil {
				logger.Info("Migrating overlay settings from JSON file", zap.String("path", jsonPath))

				// データベースに保存
				if err := saveOverlaySettingsToDB(&settings); err != nil {
					logger.Error("Failed to migrate overlay settings to database", zap.Error(err))
				} else {
					// 移行成功したらJSONファイルをリネーム
					backupPath := jsonPath + ".migrated"
					if err := os.Rename(jsonPath, backupPath); err != nil {
						logger.Warn("Failed to rename migrated JSON file", zap.Error(err))
					} else {
						logger.Info("Migrated and renamed JSON file", zap.String("backup", backupPath))
					}
				}
				return
			}
		}
	}
}

// saveOverlaySettings saves settings to database
func saveOverlaySettings(settings *OverlaySettings) error {
	return saveOverlaySettingsToDB(settings)
}

// saveOverlaySettingsToDB saves overlay settings to database
func saveOverlaySettingsToDB(overlaySettings *OverlaySettings) error {
	overlaySettings.UpdatedAt = time.Now()

	// データベース接続を取得
	db, err := localdb.SetupDB(paths.GetDBPath())
	if err != nil {
		logger.Error("Failed to setup database", zap.Error(err))
		return err
	}

	settingsManager := settings.NewSettingsManager(db)

	// 各設定を保存
	settingsToSave := map[string]string{
		"MUSIC_ENABLED":           strconv.FormatBool(overlaySettings.MusicEnabled),
		"MUSIC_VOLUME":            strconv.Itoa(overlaySettings.MusicVolume),
		"MUSIC_AUTO_PLAY":         strconv.FormatBool(overlaySettings.MusicAutoPlay),
		"FAX_ENABLED":             strconv.FormatBool(overlaySettings.FaxEnabled),
		"FAX_ANIMATION_SPEED":     fmt.Sprintf("%.2f", overlaySettings.FaxAnimationSpeed),
		"FAX_IMAGE_TYPE":          overlaySettings.FaxImageType,
		"OVERLAY_CLOCK_ENABLED":   strconv.FormatBool(overlaySettings.ClockEnabled),
		"OVERLAY_CLOCK_FORMAT":    overlaySettings.ClockFormat,
		"CLOCK_SHOW_ICONS":        strconv.FormatBool(overlaySettings.ClockShowIcons),
		"OVERLAY_LOCATION_ENABLED": strconv.FormatBool(overlaySettings.LocationEnabled),
		"OVERLAY_DATE_ENABLED":    strconv.FormatBool(overlaySettings.DateEnabled),
		"OVERLAY_TIME_ENABLED":    strconv.FormatBool(overlaySettings.TimeEnabled),
		"OVERLAY_DEBUG_ENABLED":   strconv.FormatBool(overlaySettings.DebugEnabled),
	}

	// MusicPlaylistはnilの場合は空文字列として保存
	if overlaySettings.MusicPlaylist != nil {
		settingsToSave["MUSIC_PLAYLIST"] = *overlaySettings.MusicPlaylist
	} else {
		settingsToSave["MUSIC_PLAYLIST"] = ""
	}

	for key, value := range settingsToSave {
		if err := settingsManager.SetSetting(key, value); err != nil {
			logger.Error("Failed to save overlay setting",
				zap.String("key", key),
				zap.String("value", value),
				zap.Error(err))
			// エラーがあっても続行（部分的な保存を許可）
		}
	}

	logger.Debug("Saved overlay settings to database",
		zap.Bool("music_enabled", overlaySettings.MusicEnabled),
		zap.Bool("fax_enabled", overlaySettings.FaxEnabled))

	return nil
}

// broadcastSettingsUpdate sends settings update to all SSE and WebSocket clients
func broadcastSettingsUpdate(settings *OverlaySettings) {
	// WebSocketクライアントに送信
	BroadcastWSMessage("settings", settings)

	// SSEクライアントにも送信（互換性のため）
	settingsEventClientsMu.RLock()
	defer settingsEventClientsMu.RUnlock()

	data, err := json.Marshal(settings)
	if err != nil {
		logger.Error("Failed to marshal settings for SSE", zap.Error(err))
		return
	}

	message := "data: " + string(data) + "\n\n"
	for client := range settingsEventClients {
		select {
		case client <- message:
			// Sent successfully
		default:
			// Client is not ready, skip
		}
	}
}

// handleOverlaySettingsUpdate handles POST /api/settings/overlay
func handleOverlaySettingsUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var settings OverlaySettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Update in-memory settings
	overlaySettingsMutex.Lock()
	currentOverlaySettings = &settings
	overlaySettingsMutex.Unlock()

	// Save to file
	if err := saveOverlaySettings(&settings); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	// Broadcast to SSE clients
	broadcastSettingsUpdate(&settings)

	logger.Debug("Updated overlay settings",
		zap.Bool("music_enabled", settings.MusicEnabled),
		zap.Bool("fax_enabled", settings.FaxEnabled))

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleOverlaySettingsGet handles GET /api/settings/overlay
func handleOverlaySettingsGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	overlaySettingsMutex.RLock()
	settings := currentOverlaySettings
	overlaySettingsMutex.RUnlock()

	if settings == nil {
		// Return default settings if not initialized
		settings = &OverlaySettings{
			MusicEnabled:      true,
			MusicVolume:       70,
			FaxEnabled:        true,
			FaxAnimationSpeed: 1.0,
			ClockEnabled:      true,
			ClockFormat:       "24h",
			LocationEnabled:   true,
			DateEnabled:       true,
			TimeEnabled:       true,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

// handleOverlaySettingsEvents handles SSE for settings updates
func handleOverlaySettingsEvents(w http.ResponseWriter, r *http.Request) {
	// Set headers for SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Create client channel
	clientChan := make(chan string, 10)

	// Register client
	settingsEventClientsMu.Lock()
	settingsEventClients[clientChan] = true
	settingsEventClientsMu.Unlock()

	// Remove client on disconnect
	defer func() {
		settingsEventClientsMu.Lock()
		delete(settingsEventClients, clientChan)
		close(clientChan)
		settingsEventClientsMu.Unlock()
	}()

	// Send initial settings
	overlaySettingsMutex.RLock()
	if currentOverlaySettings != nil {
		if data, err := json.Marshal(currentOverlaySettings); err == nil {
			fmt.Fprintf(w, "data: %s\n\n", string(data))
			w.(http.Flusher).Flush()
		}
	}
	overlaySettingsMutex.RUnlock()

	// Keep connection alive
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg := <-clientChan:
			fmt.Fprint(w, msg)
			w.(http.Flusher).Flush()
		case <-ticker.C:
			fmt.Fprintf(w, ": keepalive\n\n")
			w.(http.Flusher).Flush()
		case <-r.Context().Done():
			return
		}
	}
}

// RegisterOverlaySettingsRoutes registers overlay settings routes
func RegisterOverlaySettingsRoutes(mux *http.ServeMux) {
	// Initialize settings on startup
	InitOverlaySettings()

	// Register routes
	mux.HandleFunc("/api/settings/overlay", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleOverlaySettingsGet(w, r)
		case http.MethodPost:
			handleOverlaySettingsUpdate(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/settings/overlay/events", corsMiddleware(handleOverlaySettingsEvents))
}