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

	"github.com/nantokaworks/twitch-overlay/internal/env"
	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/output"
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

	// リワードカウント表示設定
	RewardCountEnabled  bool   `json:"reward_count_enabled"`  // カウント表示の有効/無効
	RewardCountGroupID  *int   `json:"reward_count_group_id"` // 表示対象のグループID（nilの場合は全て）
	RewardCountPosition string `json:"reward_count_position"` // 表示位置 ("left" or "right")

	// プレゼントルーレット設定
	LotteryEnabled         bool    `json:"lottery_enabled"`          // ルーレット機能の有効/無効
	LotteryRewardID        *string `json:"lottery_reward_id"`        // 対象リワードID
	LotteryDisplayDuration int     `json:"lottery_display_duration"` // 表示時間（秒）
	LotteryAnimationSpeed  float64 `json:"lottery_animation_speed"`  // アニメーション速度
	LotteryTickerEnabled   bool    `json:"lottery_ticker_enabled"`   // 参加者ティッカーの有効/無効

	// ティッカーお知らせ設定
	TickerNoticeEnabled  bool   `json:"ticker_notice_enabled"`   // お知らせ文の有効/無効
	TickerNoticeText     string `json:"ticker_notice_text"`      // お知らせ文の内容
	TickerNoticeFontSize int    `json:"ticker_notice_font_size"` // フォントサイズ（px）
	TickerNoticeAlign    string `json:"ticker_notice_align"`     // 配置（left/center/right）

	// マイク文字起こし表示設定
	MicTranscriptEnabled             bool   `json:"mic_transcript_enabled"`
	MicTranscriptPosition            string `json:"mic_transcript_position"`
	MicTranscriptFontSize            int    `json:"mic_transcript_font_size"`
	MicTranscriptMaxLines            int    `json:"mic_transcript_max_lines"`
	MicTranscriptTranslationEnabled  bool   `json:"mic_transcript_translation_enabled"`
	MicTranscriptTranslationLanguage string `json:"mic_transcript_translation_language"`
	MicTranscriptTranslationFontSize int    `json:"mic_transcript_translation_font_size"`

	// UI状態設定
	OverlayCardsExpanded string `json:"overlay_cards_expanded"` // カードの折りたたみ状態（JSON文字列）
	OverlayCardsLayout   string `json:"overlay_cards_layout"`   // カードの配置（JSON文字列）

	// その他の表示設定
	ShowDebugInfo bool `json:"show_debug_info"`

	// 開発者設定
	DebugEnabled bool `json:"debug_enabled"`

	// プリンター設定（nilの場合はDBから読み込み、保存時はスキップ）
	BestQuality *bool    `json:"best_quality"`
	Dither      *bool    `json:"dither"`
	BlackPoint  *float32 `json:"black_point"`
	AutoRotate  *bool    `json:"auto_rotate"`
	RotatePrint *bool    `json:"rotate_print"`

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
		MusicEnabled:                     getBoolSetting(allSettings, "MUSIC_ENABLED", true),
		MusicPlaylist:                    getStringSetting(allSettings, "MUSIC_PLAYLIST"),
		MusicVolume:                      getIntSetting(allSettings, "MUSIC_VOLUME", 70),
		MusicAutoPlay:                    getBoolSetting(allSettings, "MUSIC_AUTO_PLAY", false),
		FaxEnabled:                       getBoolSetting(allSettings, "FAX_ENABLED", true),
		FaxAnimationSpeed:                getFloatSetting(allSettings, "FAX_ANIMATION_SPEED", 1.0),
		FaxImageType:                     getStringSettingWithDefault(allSettings, "FAX_IMAGE_TYPE", "color"),
		ClockEnabled:                     getBoolSetting(allSettings, "OVERLAY_CLOCK_ENABLED", true),
		ClockFormat:                      getStringSettingWithDefault(allSettings, "OVERLAY_CLOCK_FORMAT", "24h"),
		ClockShowIcons:                   getBoolSetting(allSettings, "CLOCK_SHOW_ICONS", true),
		LocationEnabled:                  getBoolSetting(allSettings, "OVERLAY_LOCATION_ENABLED", true),
		DateEnabled:                      getBoolSetting(allSettings, "OVERLAY_DATE_ENABLED", true),
		TimeEnabled:                      getBoolSetting(allSettings, "OVERLAY_TIME_ENABLED", true),
		RewardCountEnabled:               getBoolSetting(allSettings, "REWARD_COUNT_ENABLED", false),
		RewardCountGroupID:               getIntPointerSetting(allSettings, "REWARD_COUNT_GROUP_ID"),
		RewardCountPosition:              getStringSettingWithDefault(allSettings, "REWARD_COUNT_POSITION", "left"),
		LotteryEnabled:                   getBoolSetting(allSettings, "LOTTERY_ENABLED", false),
		LotteryRewardID:                  getStringSetting(allSettings, "LOTTERY_REWARD_ID"),
		LotteryDisplayDuration:           getIntSetting(allSettings, "LOTTERY_DISPLAY_DURATION", 5),
		LotteryAnimationSpeed:            getFloatSetting(allSettings, "LOTTERY_ANIMATION_SPEED", 1.0),
		LotteryTickerEnabled:             getBoolSetting(allSettings, "LOTTERY_TICKER_ENABLED", false),
		TickerNoticeEnabled:              getBoolSetting(allSettings, "TICKER_NOTICE_ENABLED", false),
		TickerNoticeText:                 getStringSettingWithDefault(allSettings, "TICKER_NOTICE_TEXT", ""),
		TickerNoticeFontSize:             getIntSetting(allSettings, "TICKER_NOTICE_FONT_SIZE", 16),
		TickerNoticeAlign:                getStringSettingWithDefault(allSettings, "TICKER_NOTICE_ALIGN", "center"),
		MicTranscriptEnabled:             getBoolSetting(allSettings, "MIC_TRANSCRIPT_ENABLED", false),
		MicTranscriptPosition:            getStringSettingWithDefault(allSettings, "MIC_TRANSCRIPT_POSITION", "bottom-left"),
		MicTranscriptFontSize:            getIntSetting(allSettings, "MIC_TRANSCRIPT_FONT_SIZE", 20),
		MicTranscriptMaxLines:            getIntSetting(allSettings, "MIC_TRANSCRIPT_MAX_LINES", 3),
		MicTranscriptTranslationEnabled:  getBoolSetting(allSettings, "MIC_TRANSCRIPT_TRANSLATION_ENABLED", false),
		MicTranscriptTranslationLanguage: getStringSettingWithDefault(allSettings, "MIC_TRANSCRIPT_TRANSLATION_LANGUAGE", "en"),
		MicTranscriptTranslationFontSize: getIntSetting(allSettings, "MIC_TRANSCRIPT_TRANSLATION_FONT_SIZE", 16),
		OverlayCardsExpanded:             getStringSettingWithDefault(allSettings, "OVERLAY_CARDS_EXPANDED", `{"musicPlayer":true,"fax":true,"clock":true,"micTranscript":true,"rewardCount":true,"lottery":true}`),
		OverlayCardsLayout:               getStringSettingWithDefault(allSettings, "OVERLAY_CARDS_LAYOUT", `{"left":["musicPlayer","fax","clock","micTranscript"],"right":["rewardCount","lottery"]}`),
		ShowDebugInfo:                    false, // 廃止予定
		DebugEnabled:                     getBoolSetting(allSettings, "OVERLAY_DEBUG_ENABLED", false),

		// プリンター設定
		BestQuality: getBoolPointerSetting(allSettings, "BEST_QUALITY"),
		Dither:      getBoolPointerSetting(allSettings, "DITHER"),
		BlackPoint:  getFloatPointerSetting(allSettings, "BLACK_POINT"),
		AutoRotate:  getBoolPointerSetting(allSettings, "AUTO_ROTATE"),
		RotatePrint: getBoolPointerSetting(allSettings, "ROTATE_PRINT"),

		UpdatedAt: time.Now(),
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

func getIntPointerSetting(settings map[string]settings.Setting, key string) *int {
	if setting, ok := settings[key]; ok && setting.Value != "" {
		if val, err := strconv.Atoi(setting.Value); err == nil {
			return &val
		}
	}
	return nil
}

func getFloatPointerSetting(settings map[string]settings.Setting, key string) *float32 {
	if setting, ok := settings[key]; ok && setting.Value != "" {
		if val, err := strconv.ParseFloat(setting.Value, 32); err == nil {
			f32 := float32(val)
			return &f32
		}
	}
	return nil
}

func getBoolPointerSetting(settings map[string]settings.Setting, key string) *bool {
	if setting, ok := settings[key]; ok && setting.Value != "" {
		value := setting.Value == "true"
		return &value
	}
	return nil
}

func useDefaultSettings() {
	defaultSettings := &OverlaySettings{
		MusicEnabled:                     true,
		MusicPlaylist:                    nil,
		MusicVolume:                      70,
		MusicAutoPlay:                    false,
		FaxEnabled:                       true,
		FaxAnimationSpeed:                1.0,
		FaxImageType:                     "color",
		ClockEnabled:                     true,
		ClockFormat:                      "24h",
		ClockShowIcons:                   true,
		LocationEnabled:                  true,
		DateEnabled:                      true,
		TimeEnabled:                      true,
		LotteryTickerEnabled:             false,
		MicTranscriptEnabled:             false,
		MicTranscriptPosition:            "bottom-left",
		MicTranscriptFontSize:            20,
		MicTranscriptMaxLines:            3,
		MicTranscriptTranslationEnabled:  false,
		MicTranscriptTranslationLanguage: "en",
		MicTranscriptTranslationFontSize: 16,
		OverlayCardsExpanded:             `{"musicPlayer":true,"fax":true,"clock":true,"micTranscript":true,"rewardCount":true,"lottery":true}`,
		ShowDebugInfo:                    false,
		DebugEnabled:                     false,
		UpdatedAt:                        time.Now(),
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
		"MUSIC_ENABLED":                        strconv.FormatBool(overlaySettings.MusicEnabled),
		"MUSIC_VOLUME":                         strconv.Itoa(overlaySettings.MusicVolume),
		"MUSIC_AUTO_PLAY":                      strconv.FormatBool(overlaySettings.MusicAutoPlay),
		"FAX_ENABLED":                          strconv.FormatBool(overlaySettings.FaxEnabled),
		"FAX_ANIMATION_SPEED":                  fmt.Sprintf("%.2f", overlaySettings.FaxAnimationSpeed),
		"FAX_IMAGE_TYPE":                       overlaySettings.FaxImageType,
		"OVERLAY_CLOCK_ENABLED":                strconv.FormatBool(overlaySettings.ClockEnabled),
		"OVERLAY_CLOCK_FORMAT":                 overlaySettings.ClockFormat,
		"CLOCK_SHOW_ICONS":                     strconv.FormatBool(overlaySettings.ClockShowIcons),
		"OVERLAY_LOCATION_ENABLED":             strconv.FormatBool(overlaySettings.LocationEnabled),
		"OVERLAY_DATE_ENABLED":                 strconv.FormatBool(overlaySettings.DateEnabled),
		"OVERLAY_TIME_ENABLED":                 strconv.FormatBool(overlaySettings.TimeEnabled),
		"REWARD_COUNT_ENABLED":                 strconv.FormatBool(overlaySettings.RewardCountEnabled),
		"REWARD_COUNT_POSITION":                overlaySettings.RewardCountPosition,
		"LOTTERY_ENABLED":                      strconv.FormatBool(overlaySettings.LotteryEnabled),
		"LOTTERY_DISPLAY_DURATION":             strconv.Itoa(overlaySettings.LotteryDisplayDuration),
		"LOTTERY_ANIMATION_SPEED":              fmt.Sprintf("%.2f", overlaySettings.LotteryAnimationSpeed),
		"LOTTERY_TICKER_ENABLED":               strconv.FormatBool(overlaySettings.LotteryTickerEnabled),
		"TICKER_NOTICE_ENABLED":                strconv.FormatBool(overlaySettings.TickerNoticeEnabled),
		"TICKER_NOTICE_TEXT":                   overlaySettings.TickerNoticeText,
		"TICKER_NOTICE_FONT_SIZE":              strconv.Itoa(overlaySettings.TickerNoticeFontSize),
		"TICKER_NOTICE_ALIGN":                  overlaySettings.TickerNoticeAlign,
		"MIC_TRANSCRIPT_ENABLED":               strconv.FormatBool(overlaySettings.MicTranscriptEnabled),
		"MIC_TRANSCRIPT_POSITION":              overlaySettings.MicTranscriptPosition,
		"MIC_TRANSCRIPT_FONT_SIZE":             strconv.Itoa(overlaySettings.MicTranscriptFontSize),
		"MIC_TRANSCRIPT_MAX_LINES":             strconv.Itoa(overlaySettings.MicTranscriptMaxLines),
		"MIC_TRANSCRIPT_TRANSLATION_ENABLED":   strconv.FormatBool(overlaySettings.MicTranscriptTranslationEnabled),
		"MIC_TRANSCRIPT_TRANSLATION_LANGUAGE":  overlaySettings.MicTranscriptTranslationLanguage,
		"MIC_TRANSCRIPT_TRANSLATION_FONT_SIZE": strconv.Itoa(overlaySettings.MicTranscriptTranslationFontSize),
		"OVERLAY_CARDS_EXPANDED":               overlaySettings.OverlayCardsExpanded,
		"OVERLAY_CARDS_LAYOUT":                 overlaySettings.OverlayCardsLayout,
		"OVERLAY_DEBUG_ENABLED":                strconv.FormatBool(overlaySettings.DebugEnabled),
	}

	// RewardCountGroupIDはnilの場合は空文字列として保存
	if overlaySettings.RewardCountGroupID != nil {
		settingsToSave["REWARD_COUNT_GROUP_ID"] = strconv.Itoa(*overlaySettings.RewardCountGroupID)
	} else {
		settingsToSave["REWARD_COUNT_GROUP_ID"] = ""
	}

	// LotteryRewardIDはnilの場合は空文字列として保存
	if overlaySettings.LotteryRewardID != nil {
		settingsToSave["LOTTERY_REWARD_ID"] = *overlaySettings.LotteryRewardID
	} else {
		settingsToSave["LOTTERY_REWARD_ID"] = ""
	}

	// MusicPlaylistはnilの場合は空文字列として保存
	if overlaySettings.MusicPlaylist != nil {
		settingsToSave["MUSIC_PLAYLIST"] = *overlaySettings.MusicPlaylist
	} else {
		settingsToSave["MUSIC_PLAYLIST"] = ""
	}

	// プリンター設定を追加（nilの場合はスキップしてDB既存値を保持）
	if overlaySettings.BestQuality != nil {
		settingsToSave["BEST_QUALITY"] = strconv.FormatBool(*overlaySettings.BestQuality)
	}
	if overlaySettings.Dither != nil {
		settingsToSave["DITHER"] = strconv.FormatBool(*overlaySettings.Dither)
	}
	if overlaySettings.BlackPoint != nil {
		settingsToSave["BLACK_POINT"] = strconv.FormatFloat(float64(*overlaySettings.BlackPoint), 'f', -1, 32)
	}
	if overlaySettings.AutoRotate != nil {
		settingsToSave["AUTO_ROTATE"] = strconv.FormatBool(*overlaySettings.AutoRotate)
	}
	if overlaySettings.RotatePrint != nil {
		settingsToSave["ROTATE_PRINT"] = strconv.FormatBool(*overlaySettings.RotatePrint)
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

	// Decode the partial settings update as a map
	var partialSettings map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&partialSettings); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Merge with existing settings
	overlaySettingsMutex.Lock()

	// Initialize if nil
	if currentOverlaySettings == nil {
		currentOverlaySettings = &OverlaySettings{
			MusicEnabled:                     true,
			MusicVolume:                      70,
			FaxEnabled:                       true,
			FaxAnimationSpeed:                1.0,
			ClockEnabled:                     true,
			ClockFormat:                      "24h",
			LocationEnabled:                  true,
			DateEnabled:                      true,
			TimeEnabled:                      true,
			LotteryTickerEnabled:             false,
			OverlayCardsExpanded:             `{"musicPlayer":true,"fax":true,"clock":true,"rewardCount":true,"lottery":true}`,
			OverlayCardsLayout:               `{"left":["musicPlayer","fax","clock"],"right":["rewardCount","lottery"]}`,
			MicTranscriptTranslationEnabled:  false,
			MicTranscriptTranslationLanguage: "en",
			MicTranscriptTranslationFontSize: 16,
		}
	}

	// Convert current settings to map for merging
	currentJSON, err := json.Marshal(currentOverlaySettings)
	if err != nil {
		overlaySettingsMutex.Unlock()
		http.Error(w, "Failed to process current settings", http.StatusInternalServerError)
		return
	}

	var currentMap map[string]interface{}
	if err := json.Unmarshal(currentJSON, &currentMap); err != nil {
		overlaySettingsMutex.Unlock()
		http.Error(w, "Failed to process current settings", http.StatusInternalServerError)
		return
	}

	// Merge partial settings into current settings
	for key, value := range partialSettings {
		currentMap[key] = value
	}

	// Convert back to OverlaySettings struct
	mergedJSON, err := json.Marshal(currentMap)
	if err != nil {
		overlaySettingsMutex.Unlock()
		http.Error(w, "Failed to merge settings", http.StatusInternalServerError)
		return
	}

	var mergedSettings OverlaySettings
	if err := json.Unmarshal(mergedJSON, &mergedSettings); err != nil {
		overlaySettingsMutex.Unlock()
		http.Error(w, "Failed to merge settings", http.StatusInternalServerError)
		return
	}

	currentOverlaySettings = &mergedSettings
	overlaySettingsMutex.Unlock()

	// Save to file
	if err := saveOverlaySettings(&mergedSettings); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	// 設定変更後は必ず環境変数を再読み込み（プリンター設定の反映のため）
	if err := env.ReloadFromDatabase(); err != nil {
		logger.Warn("Failed to reload env values from database", zap.Error(err))
	} else {
		logger.Debug("Reloaded env values after overlay settings update")

		// Bluetooth設定時のみプリンターオプションを再設定
		if env.Value.PrinterType == "bluetooth" {
			if err := output.SetupBluetoothOptions(
				env.Value.BestQuality,
				env.Value.Dither,
				env.Value.AutoRotate,
				env.Value.BlackPoint,
			); err != nil {
				logger.Warn("Failed to update printer options", zap.Error(err))
			} else {
				logger.Debug("Updated printer options with new settings")
			}
		}
	}

	// Broadcast to SSE clients
	broadcastSettingsUpdate(&mergedSettings)

	logger.Debug("Updated overlay settings",
		zap.Bool("music_enabled", mergedSettings.MusicEnabled),
		zap.Bool("fax_enabled", mergedSettings.FaxEnabled))

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
			MusicEnabled:         true,
			MusicVolume:          70,
			FaxEnabled:           true,
			FaxAnimationSpeed:    1.0,
			ClockEnabled:         true,
			ClockFormat:          "24h",
			LocationEnabled:      true,
			DateEnabled:          true,
			TimeEnabled:          true,
			LotteryTickerEnabled: false,
			OverlayCardsExpanded: `{"musicPlayer":true,"fax":true,"clock":true,"rewardCount":true,"lottery":true}`,
			OverlayCardsLayout:   `{"left":["musicPlayer","fax","clock"],"right":["rewardCount","lottery"]}`,
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
	mux.HandleFunc("/api/overlay/refresh", corsMiddleware(handleOverlayRefresh))
}

// handleOverlayRefresh はオーバーレイに現在の設定を再送信する
func handleOverlayRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	logger.Info("Refreshing overlay settings for all clients")

	// 現在のオーバーレイ設定を全クライアントに再ブロードキャスト
	overlaySettingsMutex.RLock()
	settings := currentOverlaySettings
	overlaySettingsMutex.RUnlock()

	BroadcastWSMessage("settings", settings)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Overlay settings refreshed",
	})
}
