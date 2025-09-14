package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/base64"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	twitch "github.com/joeyak/go-twitch-eventsub/v3"
	"github.com/nantokaworks/twitch-overlay/internal/broadcast"
	"github.com/nantokaworks/twitch-overlay/internal/env"
	"github.com/nantokaworks/twitch-overlay/internal/faxmanager"
	"github.com/nantokaworks/twitch-overlay/internal/fontmanager"
	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/music"
	"github.com/nantokaworks/twitch-overlay/internal/output"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/shared/paths"
	"github.com/nantokaworks/twitch-overlay/internal/status"
	"github.com/nantokaworks/twitch-overlay/internal/twitcheventsub"
	"github.com/nantokaworks/twitch-overlay/internal/twitchtoken"
	"github.com/nantokaworks/twitch-overlay/internal/webserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.uber.org/zap"
)

// App struct
type App struct {
	ctx              context.Context
	streamStatus     status.StreamStatus
	webAssets        *embed.FS
	tokenRefreshDone chan struct{}
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// SetWebAssets sets the embedded web assets for the web server
func (a *App) SetWebAssets(assets *embed.FS) {
	a.webAssets = assets
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Phase 8: 全ての処理を有効化（Webサーバー含む）
	// ロガーを早期に初期化（デフォルト設定で）
	logger.Init(false)
	logger.Info("Twitch Overlay Desktop starting...")

	// データディレクトリを確保
	if err := paths.EnsureDataDirs(); err != nil {
		logger.Error("Failed to create data directories", zap.Error(err))
	}

	// データベースを初期化
	_, err := localdb.SetupDB(paths.GetDBPath())
	if err != nil {
		logger.Error("Failed to setup database", zap.Error(err))
	} else {
		logger.Info("Database initialized", zap.String("path", paths.GetDBPath()))
	}

	// 環境変数を読み込み（DBが初期化された後）
	env.LoadEnv()

	// ロガーを再初期化（デバッグモード設定を反映）
	if env.Value.DebugMode {
		logger.Init(true)
		logger.Info("Debug mode enabled")
	}

	// FAXマネージャーを初期化
	faxmanager.InitializeDataDir()

	// フォントマネージャーを初期化
	if err := fontmanager.Initialize(); err != nil {
		logger.Error("Failed to initialize font manager", zap.Error(err))
	}

	// 音楽データベースを初期化
	if err := music.InitMusicDB(); err != nil {
		logger.Error("Failed to initialize music database", zap.Error(err))
	}

	// ステータスマネージャーを初期化
	a.streamStatus = status.GetStreamStatus()

	// ステータス変更のコールバックを設定
	status.RegisterStatusChangeCallback(func(s status.StreamStatus) {
		a.streamStatus = s
		runtime.EventsEmit(a.ctx, "stream_status_changed", s)
	})

	// OAuth callbackサーバーは削除（メインWebサーバーで処理）
	// twitchtoken.SetupCallbackServer()

	// Twitchトークンを確認（EventSubも含む）
	if env.Value.ClientID != nil && env.Value.ClientSecret != nil {
		token, _, err := twitchtoken.GetLatestToken()
		if err == nil && token.AccessToken != "" {
			logger.Info("Twitch token found, starting refresh goroutine and EventSub")

			// EventSubを開始
			go func() {
				if err := twitcheventsub.Start(); err != nil {
					logger.Error("Failed to start EventSub", zap.Error(err))
				}
			}()

			// トークンリフレッシュgoroutineを開始
			a.tokenRefreshDone = make(chan struct{})
			go a.refreshTokenPeriodically()
		}
	}

	// プリンター設定を確認
	if env.Value.PrinterAddress != nil && *env.Value.PrinterAddress != "" {
		go func() {
			if err := a.initializePrinter(); err != nil {
				logger.Error("Failed to initialize printer", zap.Error(err))
			}
		}()
	}

	// Webサーバーを起動（OBSオーバーレイ用）
	go func() {
		port := 8080  // デフォルトポート
		if env.Value.ServerPort != 0 {
			port = env.Value.ServerPort
		}
		logger.Info("Starting web server for OBS overlay", zap.Int("port", port))
		// 埋め込みアセットをWebサーバーに設定
		webserver.SetWebAssets(a.webAssets)
		if err := webserver.StartWebServer(port); err != nil {
			logger.Error("Failed to start web server", zap.Error(err))
			// Notify frontend about the error
			runtime.EventsEmit(a.ctx, "webserver_error", map[string]interface{}{
				"error": err.Error(),
				"port":  port,
			})
		} else {
			// Notify frontend that server started successfully
			runtime.EventsEmit(a.ctx, "webserver_started", map[string]interface{}{
				"port": port,
			})
		}
	}()
}

// shutdown is called when the app is shutting down
func (a *App) shutdown(ctx context.Context) {
	logger.Info("Shutting down Twitch Overlay Desktop...")
	
	// トークンリフレッシュgoroutineを停止
	if a.tokenRefreshDone != nil {
		close(a.tokenRefreshDone)
	}
	
	// プリンターを停止
	output.Stop()
	
	// EventSubを停止
	twitcheventsub.Stop()
}

// initializePrinter initializes the printer connection
func (a *App) initializePrinter() error {
	logger.Info("Initializing printer...")
	
	// 既存の接続がある場合は先に切断
	if output.IsConnected() {
		logger.Info("Disconnecting existing printer connection")
		output.Stop()
	}
	
	// プリンターをセットアップ
	client, err := output.SetupPrinter()
	if err != nil {
		logger.Error("Failed to setup printer", zap.Error(err))
		runtime.EventsEmit(a.ctx, "printer_error", err.Error())
		return fmt.Errorf("failed to setup printer: %w", err)
	}

	// プリンターオプションを設定
	output.SetupPrinterOptions(
		env.Value.BestQuality,
		env.Value.Dither,
		env.Value.AutoRotate,
		env.Value.BlackPoint,
	)

	// プリンターに接続
	if err := output.ConnectPrinter(client, *env.Value.PrinterAddress); err != nil {
		logger.Error("Failed to connect to printer", zap.Error(err))
		runtime.EventsEmit(a.ctx, "printer_error", err.Error())
		return fmt.Errorf("failed to connect to printer: %w", err)
	}

	runtime.EventsEmit(a.ctx, "printer_connected", true)
	logger.Info("Printer connected successfully")
	return nil
}

// === Wails Exported Functions ===

// GetPrinterStatus returns the current printer connection status
func (a *App) GetPrinterStatus() map[string]interface{} {
	return map[string]interface{}{
		"connected": output.IsConnected(),
		"address":   env.Value.PrinterAddress,
	}
}

// ConnectPrinter connects to the printer with the given address
func (a *App) ConnectPrinter(address string) error {
	if address == "" {
		return fmt.Errorf("printer address is required")
	}

	// 環境変数を更新
	env.Value.PrinterAddress = &address

	// プリンターを初期化（同期的に実行）
	return a.initializePrinter()
}

// DisconnectPrinter disconnects from the printer
func (a *App) DisconnectPrinter() {
	output.Stop()
	runtime.EventsEmit(a.ctx, "printer_connected", false)
}

// ReconnectPrinter forces a complete reconnection to the printer
func (a *App) ReconnectPrinter() error {
	logger.Info("Reconnecting to printer")
	
	// プリンターアドレスを取得
	if env.Value.PrinterAddress == nil || *env.Value.PrinterAddress == "" {
		return fmt.Errorf("printer address not configured")
	}
	
	address := *env.Value.PrinterAddress
	
	// プリンターオプションを設定
	output.SetupPrinterOptions(
		env.Value.BestQuality,
		env.Value.Dither,
		env.Value.AutoRotate,
		env.Value.BlackPoint,
	)
	
	// 強制的に再接続
	if err := output.ReconnectPrinter(address); err != nil {
		logger.Error("Failed to reconnect printer", zap.Error(err))
		runtime.EventsEmit(a.ctx, "printer_error", err.Error())
		runtime.EventsEmit(a.ctx, "printer_connected", false)
		return err
	}
	
	runtime.EventsEmit(a.ctx, "printer_connected", true)
	logger.Info("Printer reconnected successfully")
	return nil
}

// ScanBluetoothDevices scans for nearby Bluetooth devices
func (a *App) ScanBluetoothDevices() ([]map[string]interface{}, error) {
	logger.Info("Starting Bluetooth device scan")
	
	// スキャン専用のクライアントをセットアップ（既存接続に影響しない）
	client, err := output.SetupScannerClient()
	if err != nil {
		logger.Error("Failed to setup scanner", zap.Error(err))
		return nil, fmt.Errorf("failed to setup scanner: %w", err)
	}
	defer client.Stop()
	
	// デバッグログを有効にする
	client.Debug.Log = true
	
	// 10秒間スキャン
	client.Timeout = 10 * time.Second
	devices, err := client.ScanDevices("")
	
	if err != nil {
		logger.Error("Device scan failed", zap.Error(err))
		return nil, fmt.Errorf("device scan failed: %w", err)
	}
	
	// 結果を変換
	result := make([]map[string]interface{}, 0, len(devices))
	for mac, name := range devices {
		device := map[string]interface{}{
			"mac_address": mac,
			"name":        string(name),
			"last_seen":   time.Now().Format(time.RFC3339),
		}
		result = append(result, device)
		logger.Debug("Found device", zap.String("mac", mac), zap.String("name", string(name)))
	}
	
	logger.Info("Device scan completed", zap.Int("device_count", len(result)))
	
	// スキャン後に接続状態を通知（既存の接続状態は変わらない）
	runtime.EventsEmit(a.ctx, "printer_connected", output.IsConnected())
	
	return result, nil
}

// TestPrint sends a test pattern to the printer
func (a *App) TestPrint() error {
	if !output.IsConnected() {
		return fmt.Errorf("printer not connected")
	}

	logger.Info("Starting test print")
	
	// テスト印刷を非同期で実行
	go func() {
		// 現在時刻を生成（時:分のフォーマット、秒は不要）
		testTime := time.Now().Format("15:04")
		
		// 空のリーダーボード付きで強制印刷（第2引数:空のリーダーボード、第3引数:強制印刷）
		if err := output.PrintClockWithOptionsForce(testTime, true, true); err != nil {
			logger.Error("Failed to print test pattern", zap.Error(err))
			runtime.EventsEmit(a.ctx, "print_error", err.Error())
		} else {
			logger.Info("Test print completed successfully (forced print)")
			runtime.EventsEmit(a.ctx, "print_success", "Test print completed")
		}
	}()

	return nil
}

// GetStreamStatus returns the current stream status
func (a *App) GetStreamStatus() status.StreamStatus {
	return a.streamStatus
}

// GetAuthURL returns the Twitch OAuth URL
func (a *App) GetAuthURL() string {
	return twitchtoken.GetAuthURL()
}

// refreshTokenPeriodically はトークンの有効期限を監視し、期限の30分前に自動的にリフレッシュを行います
func (a *App) refreshTokenPeriodically() {
	logger.Info("Starting token refresh goroutine")
	
	for {
		select {
		case <-a.tokenRefreshDone:
			logger.Info("Stopping token refresh goroutine")
			return
		default:
			token, _, err := twitchtoken.GetLatestToken()
			if err != nil {
				// トークンが見つからない場合は1分後に再チェック
				time.Sleep(1 * time.Minute)
				continue
			}
			
			// 現在時刻とトークンの有効期限を比較
			now := time.Now().Unix()
			timeUntilExpiry := token.ExpiresAt - now
			
			if timeUntilExpiry <= 0 {
				// トークンがすでに期限切れの場合、即座にリフレッシュ
				logger.Info("Token has expired, refreshing immediately")
				if err := token.RefreshTwitchToken(); err != nil {
					logger.Error("Failed to refresh expired token", zap.Error(err))
					// リフレッシュに失敗した場合は5分後に再試行
					time.Sleep(5 * time.Minute)
				} else {
					logger.Info("Token refreshed successfully")
					// EventSubを再起動
					a.restartEventSub()
				}
			} else if timeUntilExpiry <= 30*60 { // 30分 = 1800秒
				// 期限の30分前になったらリフレッシュ
				logger.Info("Token expires in less than 30 minutes, refreshing now", 
					zap.Int64("seconds_until_expiry", timeUntilExpiry))
				if err := token.RefreshTwitchToken(); err != nil {
					logger.Error("Failed to refresh token", zap.Error(err))
					// リフレッシュに失敗した場合は5分後に再試行
					time.Sleep(5 * time.Minute)
				} else {
					logger.Info("Token refreshed successfully")
					// EventSubを再起動
					a.restartEventSub()
				}
			} else {
				// 次のチェックまでの時間を計算（期限の30分前になるまで待つ）
				sleepDuration := time.Duration(timeUntilExpiry-30*60) * time.Second
				// ただし、最大1時間までとする（長時間スリープを避ける）
				if sleepDuration > time.Hour {
					sleepDuration = time.Hour
				}
				logger.Debug("Next token refresh check", 
					zap.Duration("sleep_duration", sleepDuration),
					zap.Int64("seconds_until_expiry", timeUntilExpiry))
				time.Sleep(sleepDuration)
			}
		}
	}
}

// restartEventSub はEventSubを再起動します
func (a *App) restartEventSub() {
	logger.Info("Restarting EventSub after token refresh")
	
	// 既存のEventSubを停止
	twitcheventsub.Stop()
	
	// 少し待機
	time.Sleep(1 * time.Second)
	
	// EventSubを再開始
	if err := twitcheventsub.Start(); err != nil {
		logger.Error("Failed to restart EventSub", zap.Error(err))
	} else {
		logger.Info("EventSub restarted successfully")
	}
}

// HandleAuthCallback handles the OAuth callback
func (a *App) HandleAuthCallback(code string) error {
	result, err := twitchtoken.GetTwitchToken(code)
	if err != nil {
		return err
	}

	// Process token
	expiresInFloat, ok := result["expires_in"].(float64)
	if !ok {
		return fmt.Errorf("invalid expires_in")
	}
	
	expiresAt := time.Now().Unix() + int64(expiresInFloat)
	token := twitchtoken.Token{
		AccessToken:  result["access_token"].(string),
		RefreshToken: result["refresh_token"].(string),
		Scope:        result["scope"].(string),
		ExpiresAt:    expiresAt,
	}
	
	if err := token.SaveToken(); err != nil {
		return err
	}

	// Start EventSub
	go func() {
		if err := twitcheventsub.Start(); err != nil {
			logger.Error("Failed to start EventSub", zap.Error(err))
		}
	}()
	
	// トークンリフレッシュgoroutineを開始（まだ起動していない場合）
	if a.tokenRefreshDone == nil {
		a.tokenRefreshDone = make(chan struct{})
		go a.refreshTokenPeriodically()
	}

	runtime.EventsEmit(a.ctx, "auth_success", true)
	return nil
}

// GetRecentFaxes returns recent fax messages
func (a *App) GetRecentFaxes(limit int) ([]*faxmanager.Fax, error) {
	return faxmanager.GetRecentFaxes(limit)
}

// GetSettings returns the current application settings
func (a *App) GetSettings() map[string]interface{} {
	settings := make(map[string]interface{})
	
	// Copy environment values to settings
	if env.Value.PrinterAddress != nil {
		settings["printer_address"] = *env.Value.PrinterAddress
	}
	settings["debug_mode"] = env.Value.DebugMode
	settings["dry_run_mode"] = env.Value.DryRunMode
	settings["best_quality"] = env.Value.BestQuality
	settings["dither"] = env.Value.Dither
	settings["auto_rotate"] = env.Value.AutoRotate
	settings["black_point"] = env.Value.BlackPointInt
	settings["rotate_print"] = env.Value.RotatePrint
	
	if env.Value.TwitchUserID != nil {
		settings["twitch_user_id"] = *env.Value.TwitchUserID
	}
	
	return settings
}

// UpdateSettings updates application settings
func (a *App) UpdateSettings(newSettings map[string]interface{}) error {
	// データベース接続を取得
	db, err := localdb.SetupDB(paths.GetDBPath())
	if err != nil {
		return fmt.Errorf("failed to setup database: %w", err)
	}
	
	settingsManager := settings.NewSettingsManager(db)
	
	// 各設定項目をデータベースに保存
	for key, value := range newSettings {
		// フロントエンドから送られてくるキーは既に大文字なので、そのまま使用
		// ただし、DEBUG_OUTPUTは例外的に変換が必要
		dbKey := key
		
		// 一部のキーのみ変換が必要
		switch key {
		case "debug_mode":
			dbKey = "DEBUG_OUTPUT"
		}
		
		// 有効なキーかチェック
		validKeys := map[string]bool{
			"PRINTER_ADDRESS": true,
			"DEBUG_OUTPUT": true,
			"DRY_RUN_MODE": true,
			"BEST_QUALITY": true,
			"DITHER": true,
			"AUTO_ROTATE": true,
			"BLACK_POINT": true,
			"ROTATE_PRINT": true,
			"TWITCH_USER_ID": true,
			"CLIENT_ID": true,
			"CLIENT_SECRET": true,
			"TRIGGER_CUSTOM_REWORD_ID": true,
			"SERVER_PORT": true,
			"AUTO_DRY_RUN_WHEN_OFFLINE": true,
			"TIMEZONE": true,
			"KEEP_ALIVE_ENABLED": true,
			"KEEP_ALIVE_INTERVAL": true,
			"CLOCK_ENABLED": true,
			"CLOCK_WEIGHT": true,
			"CLOCK_WALLET": true,
			"CLOCK_SHOW_ICONS": true,
			"FONT_FILENAME": true,
		}
		
		if !validKeys[dbKey] {
			// 未知のキーはスキップ
			continue
		}
		
		// 値を文字列に変換
		var strValue string
		switch v := value.(type) {
		case string:
			strValue = v
		case bool:
			if v {
				strValue = "true"
			} else {
				strValue = "false"
			}
		case float64:
			strValue = fmt.Sprintf("%d", int(v))
		case int:
			strValue = fmt.Sprintf("%d", v)
		default:
			strValue = fmt.Sprintf("%v", v)
		}
		
		// バリデーション
		if err := settings.ValidateSetting(dbKey, strValue); err != nil {
			logger.Warn("Setting validation failed", zap.String("key", dbKey), zap.Error(err))
			continue
		}
		
		// データベースに保存
		if err := settingsManager.SetSetting(dbKey, strValue); err != nil {
			logger.Error("Failed to save setting", zap.String("key", dbKey), zap.Error(err))
			return fmt.Errorf("failed to save setting %s: %w", dbKey, err)
		}
		
		logger.Info("Setting saved", zap.String("key", dbKey), zap.String("value", strValue))
	}
	
	// 環境変数を再読み込み
	if err := env.ReloadFromDatabase(); err != nil {
		logger.Error("Failed to reload environment from database", zap.Error(err))
		return fmt.Errorf("failed to reload settings: %w", err)
	}
	
	// Wailsフロントエンドへの通知
	runtime.EventsEmit(a.ctx, "settings_updated", newSettings)
	
	// WebSocket経由でオーバーレイへ通知（統計情報の変更を含む）
	if weightValue, hasWeight := newSettings["CLOCK_WEIGHT"]; hasWeight {
		logger.Info("Broadcasting CLOCK_WEIGHT update", zap.Any("value", weightValue))
		broadcast.Send(map[string]interface{}{
			"type": "setting_update",
			"key": "CLOCK_WEIGHT",
			"value": weightValue,
		})
	}
	if walletValue, hasWallet := newSettings["CLOCK_WALLET"]; hasWallet {
		logger.Info("Broadcasting CLOCK_WALLET update", zap.Any("value", walletValue))
		broadcast.Send(map[string]interface{}{
			"type": "setting_update", 
			"key": "CLOCK_WALLET",
			"value": walletValue,
		})
	}
	
	return nil
}

// GetAllSettings returns all application settings from database
func (a *App) GetAllSettings() (map[string]interface{}, error) {
	// データベース接続を取得
	db, err := localdb.SetupDB(paths.GetDBPath())
	if err != nil {
		return nil, fmt.Errorf("failed to setup database: %w", err)
	}
	
	settingsManager := settings.NewSettingsManager(db)
	
	// すべての設定を取得
	allSettings, err := settingsManager.GetAllSettings()
	if err != nil {
		return nil, fmt.Errorf("failed to get all settings: %w", err)
	}
	
	// map[string]interface{}形式に変換
	result := make(map[string]interface{})
	for key, setting := range allSettings {
		// フロントエンド用のキー名に変換（全て大文字のまま保持）
		frontendKey := key  // デフォルトはそのまま使用
		
		// 値を適切な型に変換するために使用
		// キー名はそのまま保持
		
		// すべての値を文字列として返す（フロントエンドが文字列を期待しているため）
		result[frontendKey] = setting.Value
	}
	
	return result, nil
}

// GetFeatureStatus returns the feature status from database
func (a *App) GetFeatureStatus() (map[string]interface{}, error) {
	// データベース接続を取得
	db, err := localdb.SetupDB(paths.GetDBPath())
	if err != nil {
		return nil, fmt.Errorf("failed to setup database: %w", err)
	}
	
	settingsManager := settings.NewSettingsManager(db)
	
	// フィーチャーステータスを取得
	status, err := settingsManager.CheckFeatureStatus()
	if err != nil {
		return nil, fmt.Errorf("failed to check feature status: %w", err)
	}
	
	// プリンター接続状態を追加
	status.PrinterConnected = output.IsConnected()
	
	// map[string]interface{}形式に変換
	result := map[string]interface{}{
		"twitch_configured":  status.TwitchConfigured,
		"printer_configured": status.PrinterConfigured,
		"printer_connected":  status.PrinterConnected,
		"missing_settings":   status.MissingSettings,
		"warnings":          status.Warnings,
		"service_mode":      status.ServiceMode,
	}
	
	return result, nil
}

// GetServerPort returns the current server port
func (a *App) GetServerPort() int {
	if env.Value.ServerPort != 0 {
		return env.Value.ServerPort
	}
	return 8080  // デフォルトポート
}

// GetEventSubStatus returns the current EventSub connection status
func (a *App) GetEventSubStatus() map[string]interface{} {
	status := map[string]interface{}{
		"connected": twitcheventsub.IsConnected(),
	}
	
	if err := twitcheventsub.GetLastError(); err != nil {
		status["error"] = err.Error()
	}
	
	return status
}

// RestartWebServer restarts the web server with a new port
func (a *App) RestartWebServer(port int) error {
	logger.Info("Restarting web server", zap.Int("new_port", port))

	// Shutdown existing server
	webserver.Shutdown()

	// Wait briefly for shutdown to complete
	time.Sleep(500 * time.Millisecond)

	// Set embedded assets and start server with new port
	webserver.SetWebAssets(a.webAssets)
	if err := webserver.StartWebServer(port); err != nil {
		logger.Error("Failed to restart web server", zap.Error(err))
		runtime.EventsEmit(a.ctx, "webserver_error", map[string]interface{}{
			"error": err.Error(),
			"port":  port,
		})
		return err
	}
	
	// Notify frontend that server restarted successfully
	runtime.EventsEmit(a.ctx, "webserver_started", map[string]interface{}{
		"port": port,
	})
	
	return nil
}

// Music Management Functions for Settings Page

// GetMusicPlaylists returns all playlists for settings page
func (a *App) GetMusicPlaylists() (map[string]interface{}, error) {
	manager := music.GetManager()
	playlists, err := manager.GetAllPlaylists()
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"count":     len(playlists),
		"playlists": playlists,
	}, nil
}

// GetMusicTracks returns all tracks for settings page
func (a *App) GetMusicTracks() (map[string]interface{}, error) {
	manager := music.GetManager()
	tracks, err := manager.GetAllTracks()
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"count":  len(tracks),
		"tracks": tracks,
	}, nil
}

// GetPlaylistTracks returns tracks in a playlist for settings page
func (a *App) GetPlaylistTracks(playlistID string) ([]*music.PlaylistTrack, error) {
	manager := music.GetManager()
	return manager.GetPlaylistTracks(playlistID)
}

// CreateMusicPlaylist creates a new playlist
func (a *App) CreateMusicPlaylist(name, description string) (*music.Playlist, error) {
	manager := music.GetManager()
	return manager.CreatePlaylist(name, description)
}

// DeleteMusicTrack deletes a track
func (a *App) DeleteMusicTrack(trackID string) error {
	manager := music.GetManager()
	return manager.DeleteTrack(trackID)
}

// DeleteMusicPlaylist deletes a playlist
func (a *App) DeleteMusicPlaylist(playlistID string) error {
	manager := music.GetManager()
	return manager.DeletePlaylist(playlistID)
}

// AddTrackToPlaylist adds track to playlist
func (a *App) AddTrackToPlaylist(playlistID, trackID string, position int) error {
	manager := music.GetManager()
	return manager.AddTrackToPlaylist(playlistID, trackID, position)
}

// RemoveTrackFromPlaylist removes track from playlist
func (a *App) RemoveTrackFromPlaylist(playlistID, trackID string) error {
	manager := music.GetManager()
	return manager.RemoveTrackFromPlaylist(playlistID, trackID)
}

// GetTrackArtwork returns track artwork as base64 encoded data URL
func (a *App) GetTrackArtwork(trackID string) (string, error) {
	artworkPath := filepath.Join(paths.GetDataDir(), "music", "artwork", trackID+".jpg")
	
	// ファイルが存在しない場合
	if _, err := os.Stat(artworkPath); os.IsNotExist(err) {
		return "", nil
	}
	
	// ファイルを読み込み
	data, err := os.ReadFile(artworkPath)
	if err != nil {
		return "", fmt.Errorf("failed to read artwork file: %w", err)
	}
	
	// Base64エンコードして返す
	encoded := base64.StdEncoding.EncodeToString(data)
	return "data:image/jpeg;base64," + encoded, nil
}

// GetServerStatus returns the status of internal servers
func (a *App) GetServerStatus() map[string]interface{} {
	webPort := 8080
	if env.Value.ServerPort != 0 {
		webPort = env.Value.ServerPort
	}
	
	return map[string]interface{}{
		"oauth_server": map[string]interface{}{
			"port":    30303,
			"running": checkPortListening(30303),
		},
		"web_server": map[string]interface{}{
			"port":    webPort,
			"running": checkPortListening(webPort),
		},
	}
}

// checkPortListening checks if a port is listening
func checkPortListening(port int) bool {
	conn, err := net.Dial("tcp", fmt.Sprintf("localhost:%d", port))
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// GenerateFontPreview generates a preview image with the current font
func (a *App) GenerateFontPreview(text string) (string, error) {
	if text == "" {
		text = "サンプルテキスト Sample Text 123"
	}
	
	// Create chat message fragments
	fragments := []twitch.ChatMessageFragment{
		{
			Type: "text",
			Text: text,
		},
	}
	
	// Use output package to generate image
	img, err := output.GeneratePreviewImage("プレビュー", fragments)
	if err != nil {
		logger.Error("Failed to generate preview", zap.Error(err))
		return "", fmt.Errorf("failed to generate preview: %w", err)
	}
	
	return img, nil
}

// UploadFont uploads a font file
func (a *App) UploadFont(filename string, base64Data string) error {
	// Base64をデコード
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return fmt.Errorf("failed to decode base64: %w", err)
	}
	
	// fontmanagerを使用して保存
	reader := bytes.NewReader(data)
	err = fontmanager.SaveCustomFont(filename, reader, int64(len(data)))
	if err != nil {
		return err
	}
	
	// データベースに設定を保存
	db, err := localdb.SetupDB(paths.GetDBPath())
	if err != nil {
		return fmt.Errorf("failed to setup database: %w", err)
	}
	
	settingsManager := settings.NewSettingsManager(db)
	if err := settingsManager.SetSetting("FONT_FILENAME", filename); err != nil {
		return fmt.Errorf("failed to save font setting: %w", err)
	}
	
	// 環境変数を再読み込み
	if err := env.ReloadFromDatabase(); err != nil {
		logger.Warn("Failed to reload environment from database", zap.Error(err))
	}
	
	// フォントキャッシュの更新はSaveCustomFont内で自動的に行われる
	
	return nil
}

// DeleteFont deletes the custom font
func (a *App) DeleteFont() error {
	// カスタムフォントを削除
	if err := fontmanager.DeleteCustomFont(); err != nil {
		return err
	}
	
	// データベースから設定を削除
	db, err := localdb.SetupDB(paths.GetDBPath())
	if err != nil {
		return fmt.Errorf("failed to setup database: %w", err)
	}
	
	settingsManager := settings.NewSettingsManager(db)
	if err := settingsManager.SetSetting("FONT_FILENAME", ""); err != nil {
		return fmt.Errorf("failed to clear font setting: %w", err)
	}
	
	// 環境変数を再読み込み
	if err := env.ReloadFromDatabase(); err != nil {
		logger.Warn("Failed to reload environment from database", zap.Error(err))
	}
	
	return nil
}

// GetVersion returns the application version
func (a *App) GetVersion() string {
	return "1.0.0"
}