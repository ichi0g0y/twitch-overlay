package notification

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"go.uber.org/zap"
)

var (
	wailsApp           *application.App
	notificationWindow *application.WebviewWindow
)

// HTML template for notification window
const notificationHTML = `
<!DOCTYPE html>
<html>
<head>
<style>
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: hidden;
  }
  .notification {
    background: rgba(30, 30, 30, 0.95);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .drag-region {
    -webkit-app-region: drag;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 10px 16px;
    border-radius: 12px 12px 0 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
  }
  .title {
    color: white;
    font-weight: 600;
    font-size: 14px;
  }
  .close-btn {
    -webkit-app-region: no-drag;
    color: white;
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 16px;
    transition: background 0.2s;
  }
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  .content {
    padding: 16px;
    color: white;
    flex: 1;
  }
  .username {
    font-weight: 700;
    font-size: 15px;
    margin-bottom: 8px;
    color: #9147ff;
  }
  .message {
    font-size: 14px;
    line-height: 1.5;
    word-wrap: break-word;
  }
</style>
</head>
<body>
<div class="notification">
  <div class="drag-region">
    <div class="title">💬 Twitch Chat</div>
    <div class="close-btn" onclick="closeWindow()">✕</div>
  </div>
  <div class="content">
    <div class="username" id="username"></div>
    <div class="message" id="message"></div>
  </div>
</div>
<script>
  function closeWindow() {
    // Goの CloseNotification 関数を呼び出す
    if (window.go && window.go.main && window.go.main.App && window.go.main.App.CloseNotification) {
      window.go.main.App.CloseNotification();
    }
  }

  function updateContent(username, message) {
    document.getElementById('username').textContent = username;
    document.getElementById('message').textContent = message;
  }
</script>
</body>
</html>
`

// Initialize initializes the notification manager with Wails app reference
func Initialize(app *application.App) {
	wailsApp = app
	logger.Info("Notification manager initialized")
}

// ShowChatNotification shows a chat notification window
func ShowChatNotification(username, message string) {
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

	logger.Info("Showing chat notification",
		zap.String("username", username),
		zap.String("message", message))

	// If notification window already exists, update content
	if notificationWindow != nil {
		updateWindowContent(username, message)
		return
	}

	// Create new notification window (Hidden状態で作成し、位置設定後に表示)
	notificationWindow = wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:          "twitch-chat-notification",
		Title:         "Twitch Chat",
		Width:         400,
		Height:        150,
		Hidden:        true,
		Frameless:     false,
		AlwaysOnTop:   true,
		DisableResize: false,
		HTML:          notificationHTML,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 44,
			TitleBar:                application.MacTitleBarHiddenInset,
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

	// Show window after positioning (similar to settings window behavior)
	notificationWindow.Show()
	logger.Info("Notification window shown at configured position")

	// Wait for macOS to finish position adjustments before registering event listeners
	// This prevents saving unintended positions during window initialization
	time.Sleep(200 * time.Millisecond)

	// Register window event handlers after showing
	// Register window close handler
	notificationWindow.OnWindowEvent(events.Common.WindowClosing, func(e *application.WindowEvent) {
		saveWindowPosition()
		notificationWindow = nil
		logger.Info("Notification window closed")
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

	// Set initial content
	updateWindowContent(username, message)

	logger.Info("Notification window created successfully")
}

// updateWindowContent updates the content of existing notification window
func updateWindowContent(username, message string) {
	if notificationWindow == nil {
		return
	}

	// Escape JSON strings
	usernameJSON, _ := json.Marshal(username)
	messageJSON, _ := json.Marshal(message)

	jsCode := fmt.Sprintf("updateContent(%s, %s)", string(usernameJSON), string(messageJSON))
	notificationWindow.ExecJS(jsCode)

	logger.Debug("Notification window content updated",
		zap.String("username", username),
		zap.String("message", message))
}

// Close closes the notification window
func Close() {
	if notificationWindow != nil {
		notificationWindow.Close()
		notificationWindow = nil
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
