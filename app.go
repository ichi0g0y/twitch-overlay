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
	"github.com/nantokaworks/twitch-overlay/internal/notification"
	"github.com/nantokaworks/twitch-overlay/internal/output"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/shared/paths"
	"github.com/nantokaworks/twitch-overlay/internal/status"
	"github.com/nantokaworks/twitch-overlay/internal/twitchapi"
	"github.com/nantokaworks/twitch-overlay/internal/twitcheventsub"
	"github.com/nantokaworks/twitch-overlay/internal/twitchtoken"
	"github.com/nantokaworks/twitch-overlay/internal/webserver"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"go.uber.org/zap"
)

// App struct
type App struct {
	ctx              context.Context
	wailsApp         *application.App
	mainWindow       *application.WebviewWindow
	streamStatus     status.StreamStatus
	webAssets        *embed.FS
	tokenRefreshDone chan struct{}
}

// TODO(v3): Temporary stub for runtime.Screen - replace with proper v3 screen API
type Screen struct {
	ID        string
	Name      string
	Width     int
	Height    int
	IsPrimary bool
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// SetWebAssets sets the embedded web assets for the web server
func (a *App) SetWebAssets(assets *embed.FS) {
	a.webAssets = assets
}

// Startup is called when the app starts. The context is saved
// so we can call the runtime methods
// This is automatically called by Wails v3 when the app starts
func (a *App) Startup(ctx context.Context) {
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
		// Emit event to frontend
		if a.mainWindow != nil {
			a.mainWindow.EmitEvent("stream_status_changed", s)
		}
	})

	// プリンター状態変更のコールバックを設定
	status.RegisterPrinterStatusChangeCallback(func(connected bool) {
		logger.Info("Printer status changed (from callback)", zap.Bool("connected", connected))
		// Emit event to frontend
		if a.mainWindow != nil {
			a.mainWindow.EmitEvent("printer_connected", connected)
		}
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

	// 通知マネージャーを初期化（メインウインドウとは別管理）
	notification.Initialize(a.wailsApp)
	// 画面情報取得関数をnotificationパッケージに設定
	notification.SetScreenInfoProvider(func() []notification.ScreenInfoExtended {
		mainScreens := GetAllScreensWithPosition()
		notifScreens := make([]notification.ScreenInfoExtended, len(mainScreens))
		for i, s := range mainScreens {
			notifScreens[i] = notification.ScreenInfoExtended{
				X:         s.X,
				Y:         s.Y,
				Width:     s.Width,
				Height:    s.Height,
				IsPrimary: s.IsPrimary,
				Index:     s.Index,
			}
		}
		return notifScreens
	})
	// ウィンドウ位置関数プロバイダーを設定
	notification.SetWindowPositionProvider(
		GetNotificationWindowPosition,
		MoveNotificationWindowToAbsolutePosition,
		FindScreenContainingWindow,
	)

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
			if a.mainWindow != nil {
				a.mainWindow.EmitEvent("webserver_error", map[string]interface{}{
					"error": err.Error(),
					"port":  port,
				})
			}
		} else {
			// Notify frontend that server started successfully
			if a.mainWindow != nil {
				a.mainWindow.EmitEvent("webserver_started", map[string]interface{}{
					"port": port,
				})
			}

			// WebSocketクライアントを起動してバックエンドメッセージをフロントエンドに転送
			// NOTE: Settings画面が直接WebSocketに接続するようになったため、このブリッジは不要
			// go a.connectToWebSocketServer(port)
		}
	}()

	// Note: Window restoration is now handled by WindowRuntimeReady event in main.go
}

// restoreRelativePosition restores window using relative position (fallback method)
func (a *App) restoreRelativePosition(pos map[string]int) {
	logger.Info("Falling back to relative position restore",
		zap.Int("x", pos["x"]), zap.Int("y", pos["y"]),
		zap.Int("width", pos["width"]), zap.Int("height", pos["height"]))

	if pos["x"] >= 0 && pos["y"] >= 0 {
		if a.isPositionValid(pos["x"], pos["y"], pos["width"], pos["height"]) {
			if a.mainWindow != nil {
				a.mainWindow.SetPosition(pos["x"], pos["y"])
				logger.Info("Calling Show() to display window (relative position)")
				a.mainWindow.Show()
				logger.Info("Window shown at restored relative position")
				a.registerWindowEventListeners()
			}
		} else {
			logger.Warn("Saved position is invalid, centering window")
			if a.mainWindow != nil {
				a.mainWindow.Center()
				logger.Info("Calling Show() to display window (invalid position)")
				a.mainWindow.Show()
				logger.Info("Window centered and shown (invalid position)")
				a.registerWindowEventListeners()
			}
		}
	} else {
		logger.Info("No saved position, centering window")
		if a.mainWindow != nil {
			a.mainWindow.Center()
			logger.Info("Calling Show() to display window (no saved position)")
			a.mainWindow.Show()
			logger.Info("Window centered and shown (no saved position)")
			a.registerWindowEventListeners()
		}
	}
}

// restoreWindowState restores window position and size from saved settings
// This method is called when the window runtime is ready (triggered by WindowRuntimeReady event)
func (a *App) restoreWindowState() {
	logger.Info("Starting window position restoration (WindowRuntimeReady triggered)")

	// まず最初にウィンドウサイズを復元（全てのパスで共通処理）
	pos := a.GetWindowPosition()
	if pos["width"] > 0 && pos["height"] > 0 {
		if a.mainWindow != nil {
			a.mainWindow.SetSize(pos["width"], pos["height"])
		}
		logger.Info("Restored window size",
			zap.Int("width", pos["width"]),
			zap.Int("height", pos["height"]))
	}

	// 現在の画面構成を取得
	currentScreens := GetAllScreensWithPosition()
	logger.Info("Current screen configuration", zap.Int("screenCount", len(currentScreens)))

	// 現在の画面構成ハッシュを取得
	currentScreenHash := a.generateScreenConfigHash()
	logger.Info("Current screen configuration hash", zap.String("hash", currentScreenHash))

	// 保存された情報を取得
	db := localdb.GetDB()
	if db == nil {
		logger.Warn("Database not initialized, centering window")
		if a.mainWindow != nil {
			a.mainWindow.Center()
			logger.Info("Calling Show() to display window (no DB)")
			a.mainWindow.Show()
			// ウィンドウが表示された後にイベントリスナーを登録
			a.registerWindowEventListeners()
		}
		return
	}

	settingsManager := settings.NewSettingsManager(db)
	savedScreenHash, _ := settingsManager.GetRealValue("WINDOW_SCREEN_HASH")
	absoluteXStr, _ := settingsManager.GetRealValue("WINDOW_ABSOLUTE_X")
	absoluteYStr, _ := settingsManager.GetRealValue("WINDOW_ABSOLUTE_Y")
	screenIndexStr, _ := settingsManager.GetRealValue("WINDOW_SCREEN_INDEX")

	// 画面構成が変更されているかチェック（警告のみ、復帰は続行）
	if currentScreenHash != "" && savedScreenHash != "" && currentScreenHash != savedScreenHash {
		logger.Warn("Screen configuration has changed, but will try to restore position anyway",
			zap.String("current", currentScreenHash),
			zap.String("saved", savedScreenHash))
		// 画面構成が変わってもとりあえず復帰を試みる
		// isPositionValid()で位置の妥当性は別途チェックされる
	}

	// 以下のコメントアウトされたコードは、画面構成が変わると完全に復帰をスキップしていた
	// これは過保護すぎるため、警告のみにして復帰処理を続けるように変更
	/*
	if currentScreenHash != "" && savedScreenHash != "" && currentScreenHash != savedScreenHash {
		logger.Warn("Screen configuration has changed, using default window position",
			zap.String("current", currentScreenHash),
			zap.String("saved", savedScreenHash))
		// 画面構成が変更された場合は中央に配置
		if a.mainWindow != nil {
			a.mainWindow.Center()
			logger.Info("Calling Show() to display window (screen config changed)")
			a.mainWindow.Show()
			a.registerWindowEventListeners()
		}
		return
	}
	*/

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
				// 絶対座標で移動（設定ウィンドウ専用関数を使用）
				MoveSettingsWindowToAbsolutePosition(absoluteX, absoluteY)
				logger.Info("Window moved to absolute position, calling Show()")
				if a.mainWindow != nil {
					a.mainWindow.Show()
					logger.Info("Window shown at restored absolute position")
					a.registerWindowEventListeners()
				}
			} else {
				logger.Warn("Saved screen index no longer exists, centering window",
					zap.Int("savedIndex", screenIndex),
					zap.Int("availableScreens", len(currentScreens)))
				if a.mainWindow != nil {
					a.mainWindow.Center()
					logger.Info("Calling Show() to display window (invalid screen index)")
					a.mainWindow.Show()
					a.registerWindowEventListeners()
				}
			}
			return
		}
	}

	// 絶対座標がない、またはパースに失敗した場合は相対座標にフォールバック
	a.restoreRelativePosition(pos)
	logger.Info("Window position restoration completed")
}

// registerWindowEventListeners registers window event listeners for position tracking
func (a *App) registerWindowEventListeners() {
	if a.mainWindow == nil {
		return
	}

	// ウィンドウ移動時のイベントリスナー
	a.mainWindow.OnWindowEvent(events.Common.WindowDidMove, func(e *application.WindowEvent) {
		// Wails APIで位置とサイズを取得
		x, y := a.mainWindow.Position()
		width, height := a.mainWindow.Size()

		logger.Debug("WindowDidMove event triggered",
			zap.Int("x", x), zap.Int("y", y),
			zap.Int("width", width), zap.Int("height", height))

		// 位置を保存
		if err := a.SaveWindowPosition(x, y, width, height); err != nil {
			logger.Error("Failed to save window position on move", zap.Error(err))
		} else {
			logger.Debug("Window position saved on move event")
		}
	})

	// ウィンドウサイズ変更時のイベントリスナー
	a.mainWindow.OnWindowEvent(events.Common.WindowDidResize, func(e *application.WindowEvent) {
		// Wails APIで位置とサイズを取得
		x, y := a.mainWindow.Position()
		width, height := a.mainWindow.Size()

		logger.Debug("WindowDidResize event triggered",
			zap.Int("x", x), zap.Int("y", y),
			zap.Int("width", width), zap.Int("height", height))

		// サイズを保存
		if err := a.SaveWindowPosition(x, y, width, height); err != nil {
			logger.Error("Failed to save window position on resize", zap.Error(err))
		} else {
			logger.Debug("Window size saved on resize event")
		}
	})

	logger.Info("Window event listeners registered")
}

// Shutdown is called when the app is shutting down
// This is automatically called by Wails v3 when the app quits
func (a *App) Shutdown(ctx context.Context) {
	logger.Info("Shutting down Twitch Overlay Desktop...")

	// ウィンドウ位置を保存
	if a.mainWindow != nil {
		a.mainWindow.EmitEvent("save_window_position")
	}
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
		if a.mainWindow != nil {
			a.mainWindow.EmitEvent("stream_status_changed", status.GetStreamStatus())
		}

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
		if a.mainWindow != nil {
			a.mainWindow.EmitEvent("printer_error", err.Error())
		}
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
		if a.mainWindow != nil {
			a.mainWindow.EmitEvent("printer_error", err.Error())
		}
		return fmt.Errorf("failed to connect to printer: %w", err)
	}

	if a.mainWindow != nil {
		a.mainWindow.EmitEvent("printer_connected", true)
	}
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

	// Get absolute position using CGO (settings window specific)
	absX, absY, _, _ := GetSettingsWindowPosition()
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

	// Parse values with defaults
	widthVal := parseIntOrDefault(width, 1024)
	heightVal := parseIntOrDefault(height, 768)

	// Ensure width and height are valid (not zero or negative)
	// If invalid, use default values
	if widthVal <= 0 {
		widthVal = 1024
	}
	if heightVal <= 0 {
		heightVal = 768
	}

	result := map[string]int{
		"x": parseIntOrDefault(x, -1),
		"y": parseIntOrDefault(y, -1),
		"width": widthVal,
		"height": heightVal,
	}

	logger.Info("Retrieved window position",
		zap.Int("x", result["x"]), zap.Int("y", result["y"]),
		zap.Int("width", result["width"]), zap.Int("height", result["height"]))

	return result
}

// GetScreens returns all available screens
func (a *App) GetScreens() []Screen {
	screensExtended := GetAllScreensWithPosition()
	screens := make([]Screen, len(screensExtended))

	for i, s := range screensExtended {
		screens[i] = Screen{
			ID:        fmt.Sprintf("screen-%d", s.Index),
			Name:      fmt.Sprintf("Display %d", s.Index+1),
			Width:     int(s.Width),
			Height:    int(s.Height),
			IsPrimary: s.IsPrimary,
		}
	}

	return screens
}

// generateScreenConfigHash generates a hash from the current screen configuration
func (a *App) generateScreenConfigHash() string {
	screens := GetAllScreensWithPosition()
	if len(screens) == 0 {
		return ""
	}

	// Sort screens by X, Y position for consistent hashing
	sort.Slice(screens, func(i, j int) bool {
		if screens[i].X != screens[j].X {
			return screens[i].X < screens[j].X
		}
		return screens[i].Y < screens[j].Y
	})

	// Create a string representation of the screen configuration
	var configStr string
	for _, screen := range screens {
		configStr += fmt.Sprintf("%dx%d-%.0f,%.0f-%v-",
			int(screen.Width), int(screen.Height),
			screen.X, screen.Y, screen.IsPrimary)
	}

	// Generate MD5 hash
	hash := md5.Sum([]byte(configStr))
	return fmt.Sprintf("%x", hash)
}

// isPositionValid checks if a window position is valid for the current screen configuration
func (a *App) isPositionValid(x, y, width, height int) bool {
	screens := GetAllScreensWithPosition()
	if len(screens) == 0 {
		return false
	}

	// Check if window size is reasonable
	if width <= 0 || height <= 0 || width > 5000 || height > 5000 {
		return false
	}

	// Calculate window center point
	centerX := float64(x) + float64(width)/2
	centerY := float64(y) + float64(height)/2

	// Check if window center is within any screen bounds
	for _, screen := range screens {
		if centerX >= screen.X && centerX < screen.X+screen.Width &&
		   centerY >= screen.Y && centerY < screen.Y+screen.Height {
			return true
		}
	}

	// If center is not on any screen, check if window overlaps with any screen
	for _, screen := range screens {
		// Check if window rectangle overlaps with screen rectangle
		windowRight := float64(x + width)
		windowBottom := float64(y + height)
		screenRight := screen.X + screen.Width
		screenBottom := screen.Y + screen.Height

		// Check for overlap
		if float64(x) < screenRight && windowRight > screen.X &&
		   float64(y) < screenBottom && windowBottom > screen.Y {
			return true
		}
	}

	// Window is completely outside all screens
	return false
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
	if a.mainWindow != nil {
		a.mainWindow.EmitEvent("printer_connected", false)
	}
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
		if a.mainWindow != nil {
			a.mainWindow.EmitEvent("printer_error", err.Error())
			a.mainWindow.EmitEvent("printer_connected", false)
		}
		return err
	}

	if a.mainWindow != nil {
		a.mainWindow.EmitEvent("printer_connected", true)
	}
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
	if a.mainWindow != nil {
		a.mainWindow.EmitEvent("printer_connected", output.IsConnected())
	}

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
			if a.mainWindow != nil {
				a.mainWindow.EmitEvent("print_error", err.Error())
			}
		} else {
			logger.Info("Test print completed successfully (forced print)")
			if a.mainWindow != nil {
				a.mainWindow.EmitEvent("print_success", "Test print completed")
			}
		}
	}()

	return nil
}

// TestNotification sends a test notification
func (a *App) TestNotification() error {
	logger.Info("Sending test notification")

	// テスト用の通知を3つキューに追加（キューイング動作確認のため）
	notification.EnqueueNotification(
		"テストユーザー1",
		"これは1つ目のテスト通知です！",
	)
	notification.EnqueueNotification(
		"テストユーザー2",
		"これは2つ目のテスト通知です！キューに入って順番に表示されます。",
	)
	notification.EnqueueNotification(
		"テストユーザー3",
		"これは3つ目のテスト通知です！設定した秒数ごとに切り替わります。",
	)

	logger.Info("Enqueued 3 test notifications")

	return nil
}

// CloseNotification closes the notification window
func (a *App) CloseNotification() error {
	logger.Info("Closing notification window from frontend")
	notification.Close()
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

	if a.mainWindow != nil {
		a.mainWindow.EmitEvent("auth_success", true)
	}
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
			"NOTIFICATION_ENABLED": true,
			"NOTIFICATION_DISPLAY_DURATION": true,
			"NOTIFICATION_FONT_SIZE": true,
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
	if a.mainWindow != nil {
		a.mainWindow.EmitEvent("settings_updated", newSettings)
	}

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
						if a.mainWindow != nil {
							a.mainWindow.EmitEvent("music_status_update", data)
						}
					}
				case "music_control":
					if data, ok := msg["data"].(map[string]interface{}); ok {
						if a.mainWindow != nil {
							a.mainWindow.EmitEvent("music_control_command", data)
						}
					}
				case "fax":
					if data, ok := msg["data"].(map[string]interface{}); ok {
						if a.mainWindow != nil {
							a.mainWindow.EmitEvent("fax_received", data)
						}
					}
				case "eventsub":
					if data, ok := msg["data"].(map[string]interface{}); ok {
						if a.mainWindow != nil {
							a.mainWindow.EmitEvent("eventsub_event", data)
						}
					}
				default:
					// その他のメッセージも転送
					if a.mainWindow != nil {
						a.mainWindow.EmitEvent(msgType, msg["data"])
					}
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

// ResetNotificationWindowPosition 通知ウィンドウの保存された位置をクリア
func (a *App) ResetNotificationWindowPosition() error {
	db := localdb.GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	settingsManager := settings.NewSettingsManager(db)

	// 通知ウィンドウの位置関連の設定をクリア
	positionKeys := []string{
		"NOTIFICATION_WINDOW_X",
		"NOTIFICATION_WINDOW_Y",
		"NOTIFICATION_WINDOW_ABSOLUTE_X",
		"NOTIFICATION_WINDOW_ABSOLUTE_Y",
		"NOTIFICATION_WINDOW_SCREEN_INDEX",
		"NOTIFICATION_WINDOW_SCREEN_HASH",
	}

	for _, key := range positionKeys {
		if err := settingsManager.SetSetting(key, ""); err != nil {
			logger.Error("Failed to clear notification window setting",
				zap.String("key", key), zap.Error(err))
			return fmt.Errorf("failed to clear %s: %w", key, err)
		}
	}

	logger.Info("Notification window position reset successfully")
	return nil
}

// ToggleCustomReward toggles a custom reward's enabled status
func (a *App) ToggleCustomReward(rewardID string, isEnabled bool) error {
	logger.Info("Toggling custom reward", zap.String("reward_id", rewardID), zap.Bool("is_enabled", isEnabled))

	// Get current token
	token, valid, err := twitchtoken.GetLatestToken()
	if err != nil || !valid {
		logger.Error("Failed to get valid token", zap.Error(err))
		return fmt.Errorf("Twitch認証が必要です")
	}

	// Get broadcaster ID from environment
	broadcasterID := env.Value.TwitchUserID
	if broadcasterID == nil || *broadcasterID == "" {
		logger.Error("TWITCH_USER_ID not configured")
		return fmt.Errorf("TWITCH_USER_IDが設定されていません")
	}

	// Call Twitch API via twitchapi package
	err = twitchapi.UpdateCustomRewardEnabled(*broadcasterID, rewardID, isEnabled, token.AccessToken)
	if err != nil {
		logger.Error("Failed to update custom reward", zap.Error(err))
		return fmt.Errorf("リワードの更新に失敗しました: %w", err)
	}

	// Save the enabled state to local database for persistence
	if err := localdb.SetRewardEnabled(rewardID, isEnabled); err != nil {
		logger.Error("Failed to save reward enabled state to database", zap.Error(err))
		// Don't fail the request, just log the error
	}

	logger.Info("Custom reward toggled successfully", zap.String("reward_id", rewardID), zap.Bool("is_enabled", isEnabled))
	return nil
}