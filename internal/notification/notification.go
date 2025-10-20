package notification

import (
	"crypto/md5"
	"fmt"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/broadcast"
	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"go.uber.org/zap"
)

// FragmentInfo represents a message fragment (text or emote)
type FragmentInfo struct {
	Type     string `json:"type"`      // "text" or "emote"
	Text     string `json:"text"`      // Display text
	EmoteID  string `json:"emoteId"`   // Emote ID (if type is "emote")
	EmoteURL string `json:"emoteUrl"`  // Emote image URL (if type is "emote")
}

// ChatNotification represents a chat notification to be displayed
type ChatNotification struct {
	Username  string         `json:"username"`
	Message   string         `json:"message"`
	Fragments []FragmentInfo `json:"fragments,omitempty"` // Optional: enhanced message with emotes
	FontSize  int            `json:"fontSize,omitempty"`  // Optional: font size in pixels
}

var (
	wailsApp              *application.App
	notificationWindow    *application.WebviewWindow
	notificationQueue     chan ChatNotification
	queueProcessorRunning bool
	queueProcessorMutex   sync.Mutex
	queueProcessorDone    chan struct{}
)

// Initialize initializes the notification manager with Wails app reference
func Initialize(app *application.App) {
	wailsApp = app

	// キューの初期化（buffered channel、容量100）
	notificationQueue = make(chan ChatNotification, 100)
	queueProcessorDone = make(chan struct{})

	// キュー処理goroutineの起動
	go startQueueProcessor()

	logger.Info("Notification manager initialized with queue processor")
}

// startQueueProcessor はキューから通知を取り出して順番に表示するgoroutine
func startQueueProcessor() {
	queueProcessorMutex.Lock()
	queueProcessorRunning = true
	queueProcessorMutex.Unlock()

	logger.Info("Queue processor started")

	for {
		select {
		case notification := <-notificationQueue:
			// キューから通知を取り出す
			logger.Info("Processing queued notification",
				zap.String("username", notification.Username),
				zap.String("message", notification.Message),
				zap.Int("queue_size", len(notificationQueue)))

			// 通知を表示
			ShowChatNotificationWithFragments(notification.Username, notification.Message, notification.Fragments)

			// 設定から表示秒数を取得
			displayDuration := getDisplayDuration()

			// 指定秒数待機
			logger.Info("Waiting for display duration",
				zap.Duration("duration", displayDuration))
			time.Sleep(displayDuration)

			// 通知ウィンドウを非表示にする
			Close()
			logger.Info("Notification hidden after display duration")

		case <-queueProcessorDone:
			// シャットダウンシグナルを受信
			logger.Info("Queue processor shutting down")
			queueProcessorMutex.Lock()
			queueProcessorRunning = false
			queueProcessorMutex.Unlock()
			return
		}
	}
}

// EnqueueNotification は通知をキューに追加する
// この関数を呼び出すと、キュー処理goroutineが順番に通知を表示する
func EnqueueNotification(username, message string) {
	EnqueueNotificationWithFragments(username, message, nil)
}

// EnqueueNotificationWithFragments は通知をキューに追加する（フラグメント付き）
// この関数を呼び出すと、キュー処理goroutineが順番に通知を表示する
func EnqueueNotificationWithFragments(username, message string, fragments []FragmentInfo) {
	if wailsApp == nil {
		logger.Error("Notification manager not initialized")
		return
	}

	// 通知が無効な場合はスキップ
	if !isNotificationEnabled() {
		logger.Debug("Notification is disabled, skipping",
			zap.String("username", username))
		return
	}

	// キューに追加
	notification := ChatNotification{
		Username:  username,
		Message:   message,
		Fragments: fragments,
	}

	select {
	case notificationQueue <- notification:
		logger.Info("Notification enqueued",
			zap.String("username", username),
			zap.Int("fragments_count", len(fragments)),
			zap.Int("queue_size", len(notificationQueue)))
	default:
		// キューが満杯の場合
		logger.Warn("Notification queue is full, dropping notification",
			zap.String("username", username))
	}
}

// getDisplayDuration は設定から通知の表示秒数を取得する
func getDisplayDuration() time.Duration {
	db := localdb.GetDB()
	if db == nil {
		// デフォルトは5秒
		return 5 * time.Second
	}

	settingsManager := settings.NewSettingsManager(db)
	durationStr, _ := settingsManager.GetRealValue("NOTIFICATION_DISPLAY_DURATION")

	// 設定がない場合はデフォルトで5秒
	if durationStr == "" {
		return 5 * time.Second
	}

	// 設定値をパース
	duration, err := strconv.Atoi(durationStr)
	if err != nil || duration < 1 || duration > 60 {
		logger.Warn("Invalid NOTIFICATION_DISPLAY_DURATION, using default",
			zap.String("value", durationStr))
		return 5 * time.Second
	}

	return time.Duration(duration) * time.Second
}

// CreateNotificationWindow creates the notification window in hidden state
// This should be called at app startup to ensure WebSocket connection is ready
func CreateNotificationWindow() {
	if wailsApp == nil {
		logger.Error("Notification manager not initialized")
		return
	}

	if notificationWindow != nil {
		logger.Debug("Notification window already exists")
		return
	}

	logger.Info("Creating notification window (hidden)")

	// Create new notification window (Hidden state)
	notificationWindow = wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:          "twitch-chat-notification",
		Title:         "Twitch Chat",
		Width:         400,
		Height:        150,
		Hidden:        true, // Start hidden
		Frameless:     false,
		AlwaysOnTop:   true,
		DisableResize: false,
		URL:           "/notification",
		Mac: application.MacWindow{
			TitleBar:                application.MacTitleBarHidden,
			InvisibleTitleBarHeight: 40,
		},
	})

	if notificationWindow == nil {
		logger.Error("Failed to create notification window")
		return
	}

	// Load saved position and size
	absX, absY, savedWidth, savedHeight, screenIndex, hasAbsolute := loadWindowPosition()

	// Wait for window to be fully created
	time.Sleep(100 * time.Millisecond)

	// Restore window size first
	notificationWindow.SetSize(int(savedWidth), int(savedHeight))
	logger.Info("Restored notification window size",
		zap.Float64("width", savedWidth), zap.Float64("height", savedHeight))

	// Get current screen configuration
	currentScreens := getScreenInfo()

	if hasAbsolute {
		// Check if saved screen index still exists
		if screenIndex < len(currentScreens) {
			// Validate position is within screen bounds
			if isPositionValid(int(absX), int(absY), int(savedWidth), int(savedHeight)) {
				// Use CGO to move window to absolute position (most accurate)
				logger.Info("Moving notification window to saved absolute position",
					zap.Float64("absX", absX), zap.Float64("absY", absY),
					zap.Int("screenIndex", screenIndex))

				// Move using CGO (bypasses Wails API coordinate issues)
				MoveNotificationWindowToAbsolutePosition(absX, absY)

				// Verify final position
				finalX, finalY, _, _ := GetNotificationWindowPosition()
				logger.Info("Notification window moved to absolute position",
					zap.Float64("final_x", finalX), zap.Float64("final_y", finalY))
			} else {
				// Position is invalid, use default
				logger.Warn("Saved position is invalid, using default position",
					zap.Float64("absX", absX), zap.Float64("absY", absY))
				defaultX, defaultY := calculateDefaultPosition(savedWidth, savedHeight)
				MoveNotificationWindowToAbsolutePosition(float64(defaultX), float64(defaultY))
			}
		} else {
			// Saved screen no longer exists, use default position
			logger.Warn("Saved screen index no longer exists, using default position",
				zap.Int("savedIndex", screenIndex),
				zap.Int("availableScreens", len(currentScreens)))
			defaultX, defaultY := calculateDefaultPosition(savedWidth, savedHeight)
			MoveNotificationWindowToAbsolutePosition(float64(defaultX), float64(defaultY))
		}
	} else {
		// No saved position, use default position (bottom-right corner)
		defaultX, defaultY := calculateDefaultPosition(savedWidth, savedHeight)
		logger.Info("Using default notification window position",
			zap.Int("x", defaultX), zap.Int("y", defaultY))

		// Move to default position using CGO
		MoveNotificationWindowToAbsolutePosition(float64(defaultX), float64(defaultY))
	}

	// Wait for macOS to finish position adjustments before registering event listeners
	time.Sleep(200 * time.Millisecond)

	// Register window event handlers
	// Register window close handler - allow the window to close and set to nil
	notificationWindow.OnWindowEvent(events.Common.WindowClosing, func(e *application.WindowEvent) {
		// Don't cancel - allow the window to close normally
		// Save position before the window is destroyed
		saveWindowPosition()
		// Set to nil so it will be recreated on next notification
		notificationWindow = nil
		logger.Info("Notification window closing - will be recreated on next notification")
	})

	// Register window moved handler - save position when window is moved
	notificationWindow.OnWindowEvent(events.Common.WindowDidMove, func(e *application.WindowEvent) {
		saveWindowPosition()
		logger.Info("Notification window moved, position saved")
	})

	// Register window resized handler - save size when window is resized
	notificationWindow.OnWindowEvent(events.Common.WindowDidResize, func(e *application.WindowEvent) {
		saveWindowPosition()
		logger.Info("Notification window resized, size saved")
	})

	logger.Info("Notification window created successfully (hidden)")
}

// ShowChatNotification shows a chat notification window
func ShowChatNotification(username, message string) {
	ShowChatNotificationWithFragments(username, message, nil)
}

// ShowChatNotificationWithFragments shows a chat notification window with fragments
func ShowChatNotificationWithFragments(username, message string, fragments []FragmentInfo) {
	if wailsApp == nil {
		logger.Error("Notification manager not initialized")
		return
	}

	// 通知が無効な場合はスキップ
	if !isNotificationEnabled() {
		logger.Debug("Notification is disabled, skipping",
			zap.String("username", username))
		return
	}

	// Create notification window if it doesn't exist (fallback)
	if notificationWindow == nil {
		logger.Warn("Notification window not created yet, creating now")
		CreateNotificationWindow()
		// Wait a bit for WebSocket initialization
		time.Sleep(300 * time.Millisecond)
	}

	if notificationWindow == nil {
		logger.Error("Failed to create notification window")
		return
	}

	logger.Info("Showing chat notification",
		zap.String("username", username),
		zap.String("message", message),
		zap.Int("fragments_count", len(fragments)))

	// Show the window (if hidden)
	notificationWindow.Show()

	// Broadcast notification content via WebSocket
	updateWindowContentWithFragments(username, message, fragments)

	logger.Info("Notification window shown with content")
}

// updateWindowContent updates the content of existing notification window
// Note: This should only be called after WindowRuntimeReady event or when window already exists
func updateWindowContent(username, message string) {
	updateWindowContentWithFragments(username, message, nil)
}

// updateWindowContentWithFragments updates the content of existing notification window with fragments
// Note: This should only be called after WindowRuntimeReady event or when window already exists
func updateWindowContentWithFragments(username, message string, fragments []FragmentInfo) {
	if notificationWindow == nil {
		logger.Warn("updateWindowContent: notification window is nil")
		return
	}

	// Get font size from settings
	fontSize := getNotificationFontSize()

	logger.Info("Updating notification window content",
		zap.String("username", username),
		zap.String("message", message),
		zap.Int("fragments_count", len(fragments)),
		zap.Int("font_size", fontSize))

	// Broadcast notification via WebSocket to all connected clients
	// This uses the same WebSocket connection as the settings window
	// Using broadcast.Send() to avoid circular dependency
	payload := map[string]interface{}{
		"type":     "chat-notification",
		"username": username,
		"message":  message,
		"fontSize": fontSize,
	}

	// フラグメントがある場合は追加
	if len(fragments) > 0 {
		payload["fragments"] = fragments
	}

	broadcast.Send(payload)

	logger.Info("Notification broadcast via WebSocket")
}

// getNotificationFontSize は設定から通知のフォントサイズを取得する
func getNotificationFontSize() int {
	db := localdb.GetDB()
	if db == nil {
		// デフォルトは14px
		return 14
	}

	settingsManager := settings.NewSettingsManager(db)
	fontSizeStr, _ := settingsManager.GetRealValue("NOTIFICATION_FONT_SIZE")

	// 設定がない場合はデフォルトで14px
	if fontSizeStr == "" {
		return 14
	}

	// 設定値をパース
	fontSize, err := strconv.Atoi(fontSizeStr)
	if err != nil || fontSize < 10 || fontSize > 24 {
		logger.Warn("Invalid NOTIFICATION_FONT_SIZE, using default",
			zap.String("value", fontSizeStr))
		return 14
	}

	return fontSize
}

// Close hides the notification window (but keeps it alive for reuse)
func Close() {
	if notificationWindow != nil {
		notificationWindow.Hide()
		logger.Info("Notification window hidden (not destroyed)")
	}
}

// saveWindowPosition saves the notification window position to database
func saveWindowPosition() {
	if notificationWindow == nil {
		logger.Warn("saveWindowPosition called but window is nil")
		return
	}

	db := localdb.GetDB()
	if db == nil {
		logger.Error("Database not initialized, cannot save notification window position")
		return
	}

	settingsManager := settings.NewSettingsManager(db)

	// Get Wails relative position and size
	x, y := notificationWindow.Position()
	width, height := notificationWindow.Size()

	logger.Info("Saving notification window position and size",
		zap.Int("relative_x", x), zap.Int("relative_y", y),
		zap.Int("width", width), zap.Int("height", height))

	// Save relative position (for fallback)
	if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_X", strconv.Itoa(x)); err != nil {
		logger.Error("Failed to save NOTIFICATION_WINDOW_X", zap.Error(err))
		return
	}
	if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_Y", strconv.Itoa(y)); err != nil {
		logger.Error("Failed to save NOTIFICATION_WINDOW_Y", zap.Error(err))
		return
	}

	// Save size (ただしサイズが0の場合はスキップ - ウインドウを閉じるときに0になるため)
	if width > 0 && height > 0 {
		if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_WIDTH", strconv.Itoa(width)); err != nil {
			logger.Error("Failed to save NOTIFICATION_WINDOW_WIDTH", zap.Error(err))
			return
		}
		if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_HEIGHT", strconv.Itoa(height)); err != nil {
			logger.Error("Failed to save NOTIFICATION_WINDOW_HEIGHT", zap.Error(err))
			return
		}
		logger.Debug("Saved notification window size",
			zap.Int("width", width), zap.Int("height", height))
	} else {
		logger.Debug("Skipping size save (size is 0, window is closing)",
			zap.Int("width", width), zap.Int("height", height))
	}

	// Get absolute position using CGO (macOS-specific)
	absX, absY, absWidth, absHeight := GetNotificationWindowPosition()
	if absX != 0 || absY != 0 {
		if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_ABSOLUTE_X", strconv.FormatFloat(absX, 'f', -1, 64)); err != nil {
			logger.Error("Failed to save NOTIFICATION_WINDOW_ABSOLUTE_X", zap.Error(err))
			return
		}
		if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_ABSOLUTE_Y", strconv.FormatFloat(absY, 'f', -1, 64)); err != nil {
			logger.Error("Failed to save NOTIFICATION_WINDOW_ABSOLUTE_Y", zap.Error(err))
			return
		}

		// Find which screen contains the window
		screenIndex := findScreenContainingWindow(absX, absY, absWidth, absHeight)
		if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_SCREEN_INDEX", strconv.Itoa(screenIndex)); err != nil {
			logger.Error("Failed to save NOTIFICATION_WINDOW_SCREEN_INDEX", zap.Error(err))
			return
		}

		logger.Info("Saved notification window absolute position",
			zap.Float64("absoluteX", absX),
			zap.Float64("absoluteY", absY),
			zap.Int("screenIndex", screenIndex))
	}

	// Save screen configuration hash
	screenHash := generateScreenConfigHash()
	if screenHash != "" {
		if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_SCREEN_HASH", screenHash); err != nil {
			logger.Error("Failed to save NOTIFICATION_WINDOW_SCREEN_HASH", zap.Error(err))
			return
		}
		logger.Info("Saved screen configuration hash", zap.String("hash", screenHash))
	}

	logger.Info("Notification window position saved successfully")
}

// loadWindowPosition loads the saved notification window position and size from database
// Returns: absoluteX, absoluteY, width, height (for CGO), screenIndex, hasAbsolute flag
func loadWindowPosition() (absX, absY, width, height float64, screenIndex int, hasAbsolute bool) {
	db := localdb.GetDB()
	if db == nil {
		logger.Warn("loadWindowPosition: Database not initialized")
		return 0, 0, 400, 150, 0, false
	}

	settingsManager := settings.NewSettingsManager(db)

	// スクリーンハッシュチェックを削除: 保存された位置の有効性チェックは
	// ウインドウ表示時（ShowChatNotification）で行うため、ここでは不要
	// これにより、スクリーン構成が微妙に変わっても保存された位置を使用できる

	// Load size (with defaults)
	widthStr, _ := settingsManager.GetRealValue("NOTIFICATION_WINDOW_WIDTH")
	heightStr, _ := settingsManager.GetRealValue("NOTIFICATION_WINDOW_HEIGHT")

	parsedWidth := 400.0  // Default width
	parsedHeight := 150.0 // Default height

	if widthStr != "" {
		if w, err := strconv.ParseFloat(widthStr, 64); err == nil && w > 0 {
			parsedWidth = w
		}
	}
	if heightStr != "" {
		if h, err := strconv.ParseFloat(heightStr, 64); err == nil && h > 0 {
			parsedHeight = h
		}
	}

	// Try to load absolute position first (preferred method)
	absXStr, _ := settingsManager.GetRealValue("NOTIFICATION_WINDOW_ABSOLUTE_X")
	absYStr, _ := settingsManager.GetRealValue("NOTIFICATION_WINDOW_ABSOLUTE_Y")
	screenIndexStr, _ := settingsManager.GetRealValue("NOTIFICATION_WINDOW_SCREEN_INDEX")

	if absXStr != "" && absYStr != "" {
		parsedX, errX := strconv.ParseFloat(absXStr, 64)
		parsedY, errY := strconv.ParseFloat(absYStr, 64)
		parsedScreenIndex := 0 // Default to primary screen
		if screenIndexStr != "" {
			if si, err := strconv.Atoi(screenIndexStr); err == nil {
				parsedScreenIndex = si
			}
		}

		if errX == nil && errY == nil {
			logger.Info("loadWindowPosition: Loaded absolute position and size",
				zap.Float64("absX", parsedX), zap.Float64("absY", parsedY),
				zap.Float64("width", parsedWidth), zap.Float64("height", parsedHeight),
				zap.Int("screenIndex", parsedScreenIndex))
			return parsedX, parsedY, parsedWidth, parsedHeight, parsedScreenIndex, true
		}
	}

	// No absolute position available
	logger.Debug("loadWindowPosition: No absolute position found, will use default")
	return 0, 0, parsedWidth, parsedHeight, 0, false
}

// calculateDefaultPosition calculates the default notification window position
// (bottom-right corner of primary screen with 20px margin)
func calculateDefaultPosition(windowWidth, windowHeight float64) (x, y int) {
	// Get primary screen using the screen info provider
	screens := getScreenInfo()
	if len(screens) == 0 {
		logger.Warn("No screens found, using fallback position")
		return 100, 100
	}

	var targetScreen ScreenInfoExtended
	found := false

	// Find primary screen
	for _, screen := range screens {
		if screen.IsPrimary {
			targetScreen = screen
			found = true
			logger.Info("Using primary screen for notification default position",
				zap.Int("index", screen.Index),
				zap.Float64("x", targetScreen.X),
				zap.Float64("y", targetScreen.Y))
			break
		}
	}

	// If no primary screen, use first screen
	if !found {
		targetScreen = screens[0]
		logger.Info("No primary screen found, using first screen",
			zap.Int("index", targetScreen.Index))
	}

	// Calculate bottom-right position with margin
	const margin = 20

	x = int(targetScreen.X + targetScreen.Width - windowWidth - margin)
	y = int(targetScreen.Y + targetScreen.Height - windowHeight - margin)

	logger.Info("Calculated default notification position",
		zap.Int("x", x), zap.Int("y", y),
		zap.Float64("windowWidth", windowWidth), zap.Float64("windowHeight", windowHeight))

	return x, y
}

// isPositionValid checks if a window position is valid for the current screen configuration
func isPositionValid(x, y, width, height int) bool {
	screens := getScreenInfo()
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

// ScreenInfoExtended represents screen information (imported from main package)
type ScreenInfoExtended struct {
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
	IsPrimary bool    `json:"isPrimary"`
	Index     int     `json:"index"`
}

// screenInfoProvider is a function that returns screen information
// Set by SetScreenInfoProvider from the main package
var screenInfoProvider func() []ScreenInfoExtended

// SetScreenInfoProvider sets the screen information provider function
func SetScreenInfoProvider(provider func() []ScreenInfoExtended) {
	screenInfoProvider = provider
}

// getScreenInfo returns screen information using the provider
func getScreenInfo() []ScreenInfoExtended {
	if screenInfoProvider != nil {
		return screenInfoProvider()
	}
	// Fallback implementation if not set
	logger.Warn("Screen info provider not set, using fallback")
	return []ScreenInfoExtended{
		{X: 0, Y: 0, Width: 1920, Height: 1080, IsPrimary: true, Index: 0},
	}
}

// isNotificationEnabled checks if notification is enabled in settings
func isNotificationEnabled() bool {
	db := localdb.GetDB()
	if db == nil {
		return true // デフォルトは有効
	}

	settingsManager := settings.NewSettingsManager(db)
	enabled, _ := settingsManager.GetRealValue("NOTIFICATION_ENABLED")

	// 設定がない場合はデフォルトで有効
	if enabled == "" {
		return true
	}

	return enabled == "true"
}

// Helper function providers (set by main package)
var (
	GetNotificationWindowPosition            func() (x, y, width, height float64)
	MoveNotificationWindowToAbsolutePosition func(x, y float64)
	FindScreenContainingWindow               func(windowX, windowY, windowWidth, windowHeight float64) int
)

// SetWindowPositionProvider sets the window position function providers
func SetWindowPositionProvider(
	getPos func() (x, y, width, height float64),
	movePos func(x, y float64),
	findScreen func(windowX, windowY, windowWidth, windowHeight float64) int,
) {
	GetNotificationWindowPosition = getPos
	MoveNotificationWindowToAbsolutePosition = movePos
	FindScreenContainingWindow = findScreen
}

// findScreenContainingWindow finds which screen contains the notification window
func findScreenContainingWindow(windowX, windowY, windowWidth, windowHeight float64) int {
	if FindScreenContainingWindow != nil {
		return FindScreenContainingWindow(windowX, windowY, windowWidth, windowHeight)
	}

	// Fallback: return 0 (primary screen)
	logger.Warn("FindScreenContainingWindow provider not set, using fallback")
	return 0
}

// generateScreenConfigHash generates a hash from the screen configuration
func generateScreenConfigHash() string {
	screens := getScreenInfo()
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
