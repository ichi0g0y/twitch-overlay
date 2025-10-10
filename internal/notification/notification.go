package notification

import (
	"encoding/json"
	"fmt"
	"strconv"

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
    window.wails.Window.Close();
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

	// Load saved position or use default
	x, y := calculateDefaultPosition()
	if savedX, savedY, exists := loadWindowPosition(); exists {
		x, y = savedX, savedY
		logger.Info("Using saved notification window position",
			zap.Int("x", x), zap.Int("y", y))
	} else {
		logger.Info("Using default notification window position",
			zap.Int("x", x), zap.Int("y", y))
	}

	// Create new notification window
	notificationWindow = wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:          "twitch-chat-notification",
		Title:         "Twitch Chat",
		Width:         400,
		Height:        150,
		X:             x,
		Y:             y,
		Frameless:     false,
		AlwaysOnTop:   true,
		DisableResize: true,
		HTML:          notificationHTML,
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHiddenInset,
		},
	})

	if notificationWindow == nil {
		logger.Error("Failed to create notification window")
		return
	}

	// Register window close handler
	notificationWindow.OnWindowEvent(events.Common.WindowClosing, func(e *application.WindowEvent) {
		saveWindowPosition()
		notificationWindow = nil
		logger.Info("Notification window closed")
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
		return
	}

	// Get window position
	x, y := notificationWindow.Position()

	logger.Info("Saving notification window position",
		zap.Int("x", x), zap.Int("y", y))

	// Save to database
	db := localdb.GetDB()
	if db == nil {
		logger.Error("Database not initialized, cannot save notification window position")
		return
	}

	settingsManager := settings.NewSettingsManager(db)
	if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_X", strconv.Itoa(x)); err != nil {
		logger.Error("Failed to save NOTIFICATION_WINDOW_X", zap.Error(err))
	}
	if err := settingsManager.SetSetting("NOTIFICATION_WINDOW_Y", strconv.Itoa(y)); err != nil {
		logger.Error("Failed to save NOTIFICATION_WINDOW_Y", zap.Error(err))
	}

	logger.Info("Notification window position saved successfully")
}

// loadWindowPosition loads the saved notification window position from database
func loadWindowPosition() (x, y int, exists bool) {
	db := localdb.GetDB()
	if db == nil {
		return 0, 0, false
	}

	settingsManager := settings.NewSettingsManager(db)
	xStr, _ := settingsManager.GetRealValue("NOTIFICATION_WINDOW_X")
	yStr, _ := settingsManager.GetRealValue("NOTIFICATION_WINDOW_Y")

	if xStr == "" || yStr == "" {
		return 0, 0, false
	}

	x, errX := strconv.Atoi(xStr)
	y, errY := strconv.Atoi(yStr)

	if errX != nil || errY != nil {
		logger.Warn("Failed to parse saved notification window position",
			zap.String("x", xStr), zap.String("y", yStr))
		return 0, 0, false
	}

	return x, y, true
}

// calculateDefaultPosition calculates the default notification window position
// (bottom-right corner of primary screen with 20px margin)
func calculateDefaultPosition() (x, y int) {
	// Get primary screen using the screen info provider
	screens := getScreenInfo()
	if len(screens) == 0 {
		logger.Warn("No screens found, using fallback position")
		return 100, 100
	}

	// Find primary screen
	var primaryScreen ScreenInfoExtended
	found := false
	for _, screen := range screens {
		if screen.IsPrimary {
			primaryScreen = screen
			found = true
			break
		}
	}

	// If no primary screen, use first screen
	if !found {
		primaryScreen = screens[0]
	}

	// Calculate bottom-right position with margin
	const windowWidth = 400
	const windowHeight = 150
	const margin = 20

	x = int(primaryScreen.X + primaryScreen.Width - windowWidth - margin)
	y = int(primaryScreen.Y + primaryScreen.Height - windowHeight - margin)

	return x, y
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
