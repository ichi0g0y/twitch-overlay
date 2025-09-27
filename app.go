package main

import (
	"bytes"
	"context"
	"crypto/md5"
	"embed"
	"encoding/base64"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
	twitch "github.com/joeyak/go-twitch-eventsub/v3"
	"github.com/nantokaworks/twitch-overlay/internal/broadcast"
	"github.com/nantokaworks/twitch-overlay/internal/cache"
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
	"github.com/nantokaworks/twitch-overlay/internal/twitchapi"
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

	// UI状態復元関連のクリーンアップ（環境変数でクリーンスタートが指定された場合）
	if cleanStart := os.Getenv("CLEAN_START"); cleanStart == "true" {
		logger.Info("Clean start mode enabled - clearing UI state files")
		a.clearUIStateFiles()
	}

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

	// キャッシュシステムを初期化
	logger.Info("Starting cache system initialization")

	// 環境変数でキャッシュ機能を無効化できる
	if disableCache := os.Getenv("DISABLE_CACHE"); disableCache == "true" {
		logger.Info("Cache system disabled by environment variable DISABLE_CACHE=true")
	} else {
		if err := cache.InitializeCache(); err != nil {
			logger.Error("Failed to initialize cache system - cache functionality will be limited",
				zap.Error(err),
				zap.String("impact", "Image caching will use memory-only fallback"),
				zap.String("workaround", "Set DISABLE_CACHE=true to bypass cache initialization"))
			// Note: Cache initialization failure doesn't prevent app startup
			// Image processing will work but without persistent caching
		} else {
			logger.Info("Cache system initialized successfully")
		}
	}

	// 音楽データベースを初期化
	if err := music.InitMusicDB(); err != nil {
		logger.Error("Failed to initialize music database", zap.Error(err))
	}

	// プリンターサブシステムを初期化（KeepAlive、Clockルーチンを含む）
	// 注意: env.Valueが適切に初期化された後に呼び出す必要がある
	output.InitializePrinter()

	// ステータスマネージャーを初期化
	a.streamStatus = status.GetStreamStatus()

	// ステータス変更のコールバックを設定
	status.RegisterStatusChangeCallback(func(s status.StreamStatus) {
		a.streamStatus = s
		runtime.EventsEmit(a.ctx, "stream_status_changed", s)
	})

	// プリンター状態変更のコールバックを設定
	status.RegisterPrinterStatusChangeCallback(func(connected bool) {
		logger.Info("Printer status changed (from callback)", zap.Bool("connected", connected))
		runtime.EventsEmit(a.ctx, "printer_connected", connected)
	})

	// OAuth callbackサーバーは削除（メインWebサーバーで処理）
	// twitchtoken.SetupCallbackServer()

	// Twitchトークンを確認（EventSubも含む）
	if env.Value.ClientID != nil && env.Value.ClientSecret != nil {
		// トークンが無効な場合は自動的にリフレッシュを試みる
		token, isValid, err := twitchtoken.GetOrRefreshToken()
		if err == nil && isValid && token.AccessToken != "" {
			logger.Info("Valid Twitch token found or refreshed, starting refresh goroutine and EventSub")

			// EventSubを開始
			go func() {
				if err := twitcheventsub.Start(); err != nil {
					logger.Error("Failed to start EventSub", zap.Error(err))
					return
				}

				// EventSub開始後、現在の配信状態を確認
				// EventSubが既存の配信を検知しないため、明示的に取得
				time.Sleep(2 * time.Second) // EventSubの接続を待つ
				a.checkInitialStreamStatus()
			}()

			// トークンリフレッシュgoroutineを開始
			a.tokenRefreshDone = make(chan struct{})
			go a.refreshTokenPeriodically()
		}
	}

	// プリンター設定を確認して初回接続を試行
	// 注意: KeepAlive機能が有効な場合は、keepAliveRoutineが自動的に接続を管理する
	if env.Value.PrinterAddress != nil && *env.Value.PrinterAddress != "" {
		go func() {
			// KeepAliveが無効な場合のみ手動接続を実行
			if !env.Value.KeepAliveEnabled {
				logger.Info("KeepAlive is disabled, attempting manual printer connection")
				if err := a.initializePrinter(); err != nil {
					logger.Error("Failed to initialize printer", zap.Error(err))
				}
			} else {
				logger.Info("KeepAlive is enabled, printer will be connected automatically by keepAliveRoutine")
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

			// WebSocketクライアントを起動してバックエンドメッセージをフロントエンドに転送
			go a.connectToWebSocketServer(port)
		}
	}()

	// ウィンドウ位置の復元
	go func() {
		// UIの初期化を待つ
		time.Sleep(500 * time.Millisecond) // CGOの初期化のため少し長めに待つ

		// 現在の画面構成を取得
		currentScreens := GetAllScreensWithPosition()
		logger.Info("Current screen configuration", zap.Int("screenCount", len(currentScreens)))

		// 現在の画面構成ハッシュを取得
		currentScreenHash := a.generateScreenConfigHash()
		logger.Info("Current screen configuration hash", zap.String("hash", currentScreenHash))

		// 保存された情報を取得
		db := localdb.GetDB()
		if db == nil {
			logger.Warn("Database not initialized, cannot restore window position")
			return
		}

		settingsManager := settings.NewSettingsManager(db)
		savedScreenHash, _ := settingsManager.GetRealValue("WINDOW_SCREEN_HASH")
		absoluteXStr, _ := settingsManager.GetRealValue("WINDOW_ABSOLUTE_X")
		absoluteYStr, _ := settingsManager.GetRealValue("WINDOW_ABSOLUTE_Y")
		screenIndexStr, _ := settingsManager.GetRealValue("WINDOW_SCREEN_INDEX")

		// 画面構成が変更されているかチェック
		if currentScreenHash != "" && savedScreenHash != "" && currentScreenHash != savedScreenHash {
			logger.Warn("Screen configuration has changed, using default window position",
				zap.String("current", currentScreenHash),
				zap.String("saved", savedScreenHash))
			// 画面構成が変更された場合は中央に配置
			runtime.WindowCenter(a.ctx)
			runtime.WindowShow(a.ctx)
			return
		}

		// まずウィンドウサイズを復元
		pos := a.GetWindowPosition()
		if pos["width"] > 0 && pos["height"] > 0 {
			runtime.WindowSetSize(a.ctx, pos["width"], pos["height"])
			logger.Info("Restored window size",
				zap.Int("width", pos["width"]),
				zap.Int("height", pos["height"]))
		}

		// 絶対座標が保存されている場合は使用
		if absoluteXStr != "" && absoluteYStr != "" {
			absoluteX, errX := strconv.ParseFloat(absoluteXStr, 64)
			absoluteY, errY := strconv.ParseFloat(absoluteYStr, 64)
			screenIndex := parseIntOrDefault(screenIndexStr, 0)

			if errX == nil && errY == nil {
				logger.Info("Restoring window to absolute position",
					zap.Float64("absoluteX", absoluteX),
					zap.Float64("absoluteY", absoluteY),
					zap.Int("screenIndex", screenIndex))

				// 保存されたスクリーンが存在するか確認
				if screenIndex < len(currentScreens) {
					// 絶対座標で移動
					MoveWindowToAbsolutePosition(absoluteX, absoluteY)
					logger.Info("Window moved to absolute position successfully")
					runtime.WindowShow(a.ctx)
					return
				} else {
					logger.Warn("Saved screen index no longer exists, centering window",
						zap.Int("savedIndex", screenIndex),
						zap.Int("availableScreens", len(currentScreens)))
					runtime.WindowCenter(a.ctx)
					runtime.WindowShow(a.ctx)
					return
				}
			}
		}

		// 絶対座標がない場合は従来の方法にフォールバック
		logger.Info("Falling back to relative position restore",
			zap.Int("x", pos["x"]), zap.Int("y", pos["y"]),
			zap.Int("width", pos["width"]), zap.Int("height", pos["height"]))

		if pos["x"] >= 0 && pos["y"] >= 0 {
			if a.isPositionValid(pos["x"], pos["y"], pos["width"], pos["height"]) {
				runtime.WindowSetPosition(a.ctx, pos["x"], pos["y"])
			} else {
				runtime.WindowCenter(a.ctx)
			}
		}

		// ウィンドウを表示
		runtime.WindowShow(a.ctx)
	}()
}

// shutdown is called when the app is shutting down
func (a *App) shutdown(ctx context.Context) {
	logger.Info("Shutting down Twitch Overlay Desktop...")

	// ウィンドウ位置を保存
	runtime.EventsEmit(a.ctx, "save_window_position")
	// 保存処理を待つ
	time.Sleep(100 * time.Millisecond)

	// トークンリフレッシュgoroutineを停止
	if a.tokenRefreshDone != nil {
		close(a.tokenRefreshDone)
	}

	// プリンターを停止
	output.Stop()

	// EventSubを停止
	twitcheventsub.Stop()
}

// clearUIStateFiles removes application state files to ensure clean startup
func (a *App) clearUIStateFiles() {
	logger.Info("Clearing UI state files for clean startup")

	// macOSアプリケーション設定ファイルをクリア
	homeDir, err := os.UserHomeDir()
	if err != nil {
		logger.Error("Failed to get home directory for UI state cleanup", zap.Error(err))
		return
	}

	// AppKitの永続状態ファイルを削除
	stateFiles := []string{
		filepath.Join(homeDir, "Library", "Saved Application State", "com.wails.twitch-overlay.savedState"),
		filepath.Join(homeDir, "Library", "Preferences", "com.wails.twitch-overlay.plist"),
		filepath.Join(homeDir, "Library", "Application Support", "com.wails.twitch-overlay"),
	}

	for _, path := range stateFiles {
		if info, err := os.Stat(path); err == nil {
			if info.IsDir() {
				if err := os.RemoveAll(path); err != nil {
					logger.Warn("Failed to remove UI state directory",
						zap.String("path", path),
						zap.Error(err))
				} else {
					logger.Info("Removed UI state directory", zap.String("path", path))
				}
			} else {
				if err := os.Remove(path); err != nil {
					logger.Warn("Failed to remove UI state file",
						zap.String("path", path),
						zap.Error(err))
				} else {
					logger.Info("Removed UI state file", zap.String("path", path))
				}
			}
		}
	}
}

// checkInitialStreamStatus checks and sets the initial stream status on startup
func (a *App) checkInitialStreamStatus() {
	logger.Info("Checking initial stream status...")

	// Twitchユーザーが設定されているか確認
	if env.Value.TwitchUserID == nil || *env.Value.TwitchUserID == "" {
		logger.Warn("Cannot check stream status: Twitch user ID not configured")
		return
	}

	// 現在の配信状態をAPIで取得
	streamInfo, err := twitchapi.GetStreamInfo()
	if err != nil {
		logger.Error("Failed to get initial stream status", zap.Error(err))
		return
	}

	if streamInfo.IsLive {
		logger.Info("Stream is currently LIVE on startup, updating status",
			zap.Int("viewer_count", streamInfo.ViewerCount))

		// 配信状態を更新（startedAtはnilだがEventSubが後で更新する）
		status.UpdateStreamStatus(true, nil, streamInfo.ViewerCount)

		// フロントエンドに通知
		runtime.EventsEmit(a.ctx, "stream_status_changed", status.GetStreamStatus())

		// AUTO_DRY_RUN_WHEN_OFFLINEの状態をログ出力
		if env.Value.AutoDryRunWhenOffline {
			logger.Info("AUTO_DRY_RUN_WHEN_OFFLINE is enabled, but stream is LIVE - dry-run disabled")
		}
	} else {
		logger.Info("Stream is OFFLINE on startup")

		// 明示的にオフライン状態を設定
		status.SetStreamOffline()

		// AUTO_DRY_RUN_WHEN_OFFLINEの状態をログ出力
		if env.Value.AutoDryRunWhenOffline {
			logger.Info("AUTO_DRY_RUN_WHEN_OFFLINE is enabled and stream is OFFLINE - dry-run will be active")
		}
	}
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

// parseIntOrDefault parses a string to int, returns defaultValue on error
func parseIntOrDefault(s string, defaultValue int) int {
	if s == "" {
		return defaultValue
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return defaultValue
	}
	return v
}

// SaveWindowPosition saves the window position and size to database
func (a *App) SaveWindowPosition(x, y, width, height int) error {
	logger.Info("Saving window position",
		zap.Int("x", x), zap.Int("y", y),
		zap.Int("width", width), zap.Int("height", height))

	db := localdb.GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	settingsManager := settings.NewSettingsManager(db)
	settingsManager.SetSetting("WINDOW_X", strconv.Itoa(x))
	settingsManager.SetSetting("WINDOW_Y", strconv.Itoa(y))
	settingsManager.SetSetting("WINDOW_WIDTH", strconv.Itoa(width))
	settingsManager.SetSetting("WINDOW_HEIGHT", strconv.Itoa(height))

	// Get absolute position using CGO
	absX, absY, _, _ := GetCurrentWindowPosition()
	if absX != 0 || absY != 0 {
		settingsManager.SetSetting("WINDOW_ABSOLUTE_X", strconv.FormatFloat(absX, 'f', -1, 64))
		settingsManager.SetSetting("WINDOW_ABSOLUTE_Y", strconv.FormatFloat(absY, 'f', -1, 64))

		// Find which screen contains the window
		screenIndex := FindScreenContainingWindow(absX, absY, float64(width), float64(height))
		settingsManager.SetSetting("WINDOW_SCREEN_INDEX", strconv.Itoa(screenIndex))

		logger.Info("Saved absolute window position",
			zap.Float64("absoluteX", absX),
			zap.Float64("absoluteY", absY),
			zap.Int("screenIndex", screenIndex))
	}

	// Save screen configuration hash
	screenHash := a.generateScreenConfigHash()
	if screenHash != "" {
		settingsManager.SetSetting("WINDOW_SCREEN_HASH", screenHash)
		logger.Info("Saved screen configuration hash", zap.String("hash", screenHash))
	}

	return nil
}

// GetWindowPosition returns the saved window position and size
func (a *App) GetWindowPosition() map[string]int {
	db := localdb.GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return map[string]int{
			"x": -1, "y": -1,
			"width": 1024, "height": 768,
		}
	}

	settingsManager := settings.NewSettingsManager(db)
	x, _ := settingsManager.GetRealValue("WINDOW_X")
	y, _ := settingsManager.GetRealValue("WINDOW_Y")
	width, _ := settingsManager.GetRealValue("WINDOW_WIDTH")
	height, _ := settingsManager.GetRealValue("WINDOW_HEIGHT")

	result := map[string]int{
		"x": parseIntOrDefault(x, -1),
		"y": parseIntOrDefault(y, -1),
		"width": parseIntOrDefault(width, 1024),
		"height": parseIntOrDefault(height, 768),
	}

	logger.Info("Retrieved window position",
		zap.Int("x", result["x"]), zap.Int("y", result["y"]),
		zap.Int("width", result["width"]), zap.Int("height", result["height"]))

	return result
}

// GetScreens returns all available screens
func (a *App) GetScreens() []runtime.Screen {
	screens, err := runtime.ScreenGetAll(a.ctx)
	if err != nil {
		logger.Error("Failed to get screens", zap.Error(err))
		return []runtime.Screen{}
	}
	return screens
}

// generateScreenConfigHash generates a hash from the current screen configuration
func (a *App) generateScreenConfigHash() string {
	screens := a.GetScreens()
	if len(screens) == 0 {
		return ""
	}

	// Sort screens by width, height for consistent hashing
	sort.Slice(screens, func(i, j int) bool {
		if screens[i].Width != screens[j].Width {
			return screens[i].Width < screens[j].Width
		}
		return screens[i].Height < screens[j].Height
	})

	// Create a string representation of the screen configuration
	var configStr string
	for _, screen := range screens {
		configStr += fmt.Sprintf("%dx%d-%v-", screen.Width, screen.Height, screen.IsPrimary)
	}

	// Generate MD5 hash
	hash := md5.Sum([]byte(configStr))
	return fmt.Sprintf("%x", hash)
}

// isPositionValid checks if a window position is valid for the current screen configuration
func (a *App) isPositionValid(x, y, width, height int) bool {
	screens := a.GetScreens()
	if len(screens) == 0 {
		return false
	}

	// Without screen bounds info, we do a simpler check
	// Check if position is within reasonable range
	// For multi-monitor setup, negative coordinates are valid
	maxCoordinate := 10000 // Reasonable max coordinate
	minCoordinate := -10000 // Reasonable min coordinate

	if x < minCoordinate || x > maxCoordinate ||
	   y < minCoordinate || y > maxCoordinate {
		return false
	}

	// Check if window size is reasonable
	if width <= 0 || height <= 0 || width > 5000 || height > 5000 {
		return false
	}

	// Additional check: window should at least partially fit on the total screen area
	var totalWidth, totalHeight int
	for _, screen := range screens {
		if screen.IsPrimary {
			// For now, we assume primary screen is at origin
			// and other screens extend from there
			totalWidth = max(totalWidth, screen.Width)
			totalHeight = max(totalHeight, screen.Height)
		}
	}

	// If window is too far outside the primary screen area, consider it invalid
	if totalWidth > 0 && totalHeight > 0 {
		if x > totalWidth*2 || y > totalHeight*2 {
			return false
		}
		if x+width < -totalWidth || y+height < -totalHeight {
			return false
		}
	}

	return true
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// max returns the maximum of two integers
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// === Wails Exported Functions ===

// GetScreensExtended returns all screens with their absolute positions
func (a *App) GetScreensExtended() []ScreenInfoExtended {
	return GetAllScreensWithPosition()
}

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

// connectToWebSocketServer connects to the backend WebSocket server and forwards messages to frontend
func (a *App) connectToWebSocketServer(port int) {
	url := fmt.Sprintf("ws://localhost:%d/ws", port)
	logger.Info("Connecting to WebSocket server", zap.String("url", url))

	// 再接続ループ
	for {
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			logger.Warn("Failed to connect to WebSocket server, retrying in 5 seconds", zap.Error(err))
			time.Sleep(5 * time.Second)
			continue
		}

		logger.Info("Connected to WebSocket server")

		// メッセージ受信ループ
		for {
			var msg map[string]interface{}
			err := conn.ReadJSON(&msg)
			if err != nil {
				logger.Warn("WebSocket read error", zap.Error(err))
				conn.Close()
				break
			}

			// メッセージタイプによって適切なイベントを発行
			if msgType, ok := msg["type"].(string); ok {
				switch msgType {
				case "music_status":
					if data, ok := msg["data"].(map[string]interface{}); ok {
						runtime.EventsEmit(a.ctx, "music_status_update", data)
					}
				case "music_control":
					if data, ok := msg["data"].(map[string]interface{}); ok {
						runtime.EventsEmit(a.ctx, "music_control_command", data)
					}
				case "fax":
					if data, ok := msg["data"].(map[string]interface{}); ok {
						runtime.EventsEmit(a.ctx, "fax_received", data)
					}
				case "eventsub":
					if data, ok := msg["data"].(map[string]interface{}); ok {
						runtime.EventsEmit(a.ctx, "eventsub_event", data)
					}
				default:
					// その他のメッセージも転送
					runtime.EventsEmit(a.ctx, msgType, msg["data"])
				}
			}
		}

		// 再接続前に少し待つ
		time.Sleep(2 * time.Second)
	}
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

// TestChannelPointRedemption テスト用のチャンネルポイント報酬を発行
func (a *App) TestChannelPointRedemption(userInput string, userName string, rewardTitle string) error {
	logger.Info("TestChannelPointRedemption called",
		zap.String("user_input", userInput),
		zap.String("user_name", userName),
		zap.String("reward_title", rewardTitle))

	// テスト用のRedemptionイベントを作成
	event := &twitch.EventChannelChannelPointsCustomRewardRedemptionAdd{
		ID: "test-" + time.Now().Format("20060102150405"),
		Broadcaster: twitch.Broadcaster{
			BroadcasterUserId:    *env.Value.TwitchUserID,
			BroadcasterUserLogin: "test_broadcaster",
			BroadcasterUserName:  "Test Broadcaster",
		},
		User: twitch.User{
			UserID:    "test_user",
			UserLogin: userName,
			UserName:  userName,
		},
		UserInput: userInput,
		Status:    "fulfilled",
		Reward: twitch.CustomChannelPointReward{
			ID:     "test-reward-" + time.Now().Format("150405"),
			Title:  rewardTitle,
			Cost:   100,
			Prompt: "Test reward prompt",
		},
		RedeemedAt: time.Now(),
	}

	// EventSub経由でイベントを処理
	twitcheventsub.HandleChannelPointsCustomRedemptionAdd(*event)

	return nil
}

// ===== Cache Management API Functions =====

// GetCacheSettings キャッシュ設定を取得
func (a *App) GetCacheSettings() (map[string]interface{}, error) {
	settings, err := cache.GetCacheSettings()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"expiry_days":       settings.ExpiryDays,
		"max_size_mb":       settings.MaxSizeMB,
		"cleanup_enabled":   settings.CleanupEnabled,
		"cleanup_on_start":  settings.CleanupOnStart,
	}, nil
}

// UpdateCacheSettings キャッシュ設定を更新
func (a *App) UpdateCacheSettings(settingsMap map[string]interface{}) error {
	settings := &cache.CacheSettings{}

	if val, ok := settingsMap["expiry_days"]; ok {
		if days, ok := val.(float64); ok {
			settings.ExpiryDays = int(days)
		}
	}
	if val, ok := settingsMap["max_size_mb"]; ok {
		if sizeMB, ok := val.(float64); ok {
			settings.MaxSizeMB = int(sizeMB)
		}
	}
	if val, ok := settingsMap["cleanup_enabled"]; ok {
		if enabled, ok := val.(bool); ok {
			settings.CleanupEnabled = enabled
		}
	}
	if val, ok := settingsMap["cleanup_on_start"]; ok {
		if enabled, ok := val.(bool); ok {
			settings.CleanupOnStart = enabled
		}
	}

	return cache.UpdateCacheSettings(settings)
}

// GetCacheStats キャッシュ統計を取得
func (a *App) GetCacheStats() (map[string]interface{}, error) {
	stats, err := cache.GetCacheStats()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"total_files":      stats.TotalFiles,
		"total_size_mb":    stats.TotalSizeMB,
		"oldest_file_date": stats.OldestFileDate,
		"expired_files":    stats.ExpiredFiles,
	}, nil
}

// ClearAllCache 全キャッシュをクリア
func (a *App) ClearAllCache() error {
	return cache.ClearAllCache()
}

// RunCacheCleanup キャッシュクリーンアップを実行
func (a *App) RunCacheCleanup() error {
	if err := cache.CleanupExpiredEntries(); err != nil {
		return err
	}
	return cache.CleanupOversizeCache()
}