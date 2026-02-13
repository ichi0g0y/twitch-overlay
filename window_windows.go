//go:build windows
// +build windows

package main

import (
	"syscall"
	"unsafe"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// Windows API constants
const (
	MONITOR_DEFAULTTONULL    = 0x00000000
	MONITOR_DEFAULTTOPRIMARY = 0x00000001
	MONITOR_DEFAULTTONEAREST = 0x00000002

	SWP_NOSIZE     = 0x0001
	SWP_NOZORDER   = 0x0004
	SWP_SHOWWINDOW = 0x0040
)

// RECT structure
type RECT struct {
	Left   int32
	Top    int32
	Right  int32
	Bottom int32
}

// MONITORINFO structure
type MONITORINFO struct {
	CbSize    uint32
	RcMonitor RECT
	RcWork    RECT
	DwFlags   uint32
}

// ScreenInfoExtended represents screen information with position
type ScreenInfoExtended struct {
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
	IsPrimary bool    `json:"isPrimary"`
	Index     int     `json:"index"`
}

var (
	user32                = syscall.NewLazyDLL("user32.dll")
	procEnumDisplayMonitors = user32.NewProc("EnumDisplayMonitors")
	procGetMonitorInfo     = user32.NewProc("GetMonitorInfoW")
	procSetWindowPos       = user32.NewProc("SetWindowPos")
	procGetForegroundWindow = user32.NewProc("GetForegroundWindow")
	procGetWindowRect      = user32.NewProc("GetWindowRect")
	procMonitorFromWindow  = user32.NewProc("MonitorFromWindow")
)

// monitorEnumData is used to pass data to the enumeration callback
type monitorEnumData struct {
	screens []ScreenInfoExtended
	index   int
}

// GetAllScreensWithPosition returns all screens with their absolute positions
func GetAllScreensWithPosition() []ScreenInfoExtended {
	data := &monitorEnumData{
		screens: make([]ScreenInfoExtended, 0),
		index:   0,
	}

	// Create callback function
	callback := syscall.NewCallback(func(hMonitor uintptr, hdcMonitor uintptr, lprcMonitor uintptr, dwData uintptr) uintptr {
		// Convert dwData back to our data structure
		enumData := (*monitorEnumData)(unsafe.Pointer(dwData))

		// Get monitor info
		var info MONITORINFO
		info.CbSize = uint32(unsafe.Sizeof(info))

		ret, _, _ := procGetMonitorInfo.Call(hMonitor, uintptr(unsafe.Pointer(&info)))
		if ret == 0 {
			logger.Warn("Failed to get monitor info")
			return 1 // Continue enumeration
		}

		// Check if this is the primary monitor
		isPrimary := (info.DwFlags & 0x00000001) != 0

		// Add screen info
		screen := ScreenInfoExtended{
			X:         float64(info.RcMonitor.Left),
			Y:         float64(info.RcMonitor.Top),
			Width:     float64(info.RcMonitor.Right - info.RcMonitor.Left),
			Height:    float64(info.RcMonitor.Bottom - info.RcMonitor.Top),
			IsPrimary: isPrimary,
			Index:     enumData.index,
		}

		logger.Debug("Found monitor",
			zap.Int("index", screen.Index),
			zap.Float64("x", screen.X),
			zap.Float64("y", screen.Y),
			zap.Float64("width", screen.Width),
			zap.Float64("height", screen.Height),
			zap.Bool("isPrimary", screen.IsPrimary))

		enumData.screens = append(enumData.screens, screen)
		enumData.index++

		return 1 // Continue enumeration
	})

	// Enumerate all monitors
	ret, _, err := procEnumDisplayMonitors.Call(
		0, // NULL HDC to enumerate all displays
		0, // NULL RECT to enumerate all displays
		callback,
		uintptr(unsafe.Pointer(data)),
	)

	if ret == 0 {
		logger.Error("EnumDisplayMonitors failed", zap.Error(err))
		return []ScreenInfoExtended{}
	}

	logger.Info("Enumerated monitors", zap.Int("count", len(data.screens)))
	return data.screens
}

// MoveWindowToAbsolutePosition moves the window to absolute coordinates
func MoveWindowToAbsolutePosition(x, y float64) {
	// Get the current foreground window handle
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		logger.Warn("Failed to get foreground window")
		return
	}

	logger.Info("Moving window to absolute position",
		zap.Float64("x", x),
		zap.Float64("y", y))

	// Move window to the specified position
	ret, _, err := procSetWindowPos.Call(
		hwnd,
		0, // HWND_TOP
		uintptr(int(x)),
		uintptr(int(y)),
		0, // Width (ignored due to SWP_NOSIZE)
		0, // Height (ignored due to SWP_NOSIZE)
		SWP_NOSIZE|SWP_NOZORDER|SWP_SHOWWINDOW,
	)

	if ret == 0 {
		logger.Error("SetWindowPos failed", zap.Error(err))
	} else {
		logger.Info("Window moved successfully")
	}
}

// GetCurrentWindowPosition returns the current window position in absolute coordinates
func GetCurrentWindowPosition() (x, y, width, height float64) {
	// Get the current foreground window handle
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		logger.Warn("Failed to get foreground window")
		return 0, 0, 0, 0
	}

	// Get window rectangle
	var rect RECT
	ret, _, _ := procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&rect)))
	if ret == 0 {
		logger.Warn("Failed to get window rect")
		return 0, 0, 0, 0
	}

	x = float64(rect.Left)
	y = float64(rect.Top)
	width = float64(rect.Right - rect.Left)
	height = float64(rect.Bottom - rect.Top)

	logger.Debug("Current window position",
		zap.Float64("x", x),
		zap.Float64("y", y),
		zap.Float64("width", width),
		zap.Float64("height", height))

	return x, y, width, height
}

// MoveWindowToScreen moves window to a specific screen at relative position
func MoveWindowToScreen(screenIndex int, relativeX, relativeY float64) {
	screens := GetAllScreensWithPosition()

	if screenIndex >= 0 && screenIndex < len(screens) {
		screen := screens[screenIndex]

		// Calculate absolute position
		absoluteX := screen.X + relativeX
		absoluteY := screen.Y + relativeY

		logger.Info("Moving window to screen",
			zap.Int("screenIndex", screenIndex),
			zap.Float64("screenX", screen.X),
			zap.Float64("screenY", screen.Y),
			zap.Float64("relativeX", relativeX),
			zap.Float64("relativeY", relativeY),
			zap.Float64("absoluteX", absoluteX),
			zap.Float64("absoluteY", absoluteY))

		MoveWindowToAbsolutePosition(absoluteX, absoluteY)
	} else {
		logger.Warn("Invalid screen index",
			zap.Int("screenIndex", screenIndex),
			zap.Int("screenCount", len(screens)))
	}
}

// FindScreenContainingWindow finds which screen contains the window
func FindScreenContainingWindow(windowX, windowY, windowWidth, windowHeight float64) int {
	// Get the current foreground window handle
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		logger.Warn("Failed to get foreground window")
		return 0
	}

	// Get the monitor that contains the window
	hMonitor, _, _ := procMonitorFromWindow.Call(hwnd, MONITOR_DEFAULTTONEAREST)
	if hMonitor == 0 {
		logger.Warn("Failed to get monitor from window")
		return 0
	}

	// Get all screens to find the index
	screens := GetAllScreensWithPosition()

	// Get monitor info for the current monitor
	var info MONITORINFO
	info.CbSize = uint32(unsafe.Sizeof(info))
	ret, _, _ := procGetMonitorInfo.Call(hMonitor, uintptr(unsafe.Pointer(&info)))
	if ret == 0 {
		logger.Warn("Failed to get monitor info")
		return 0
	}

	// Find matching screen by position
	for i, screen := range screens {
		if int(screen.X) == int(info.RcMonitor.Left) &&
		   int(screen.Y) == int(info.RcMonitor.Top) {
			logger.Debug("Found containing screen", zap.Int("index", i))
			return i
		}
	}

	// If not found, return primary screen
	for i, screen := range screens {
		if screen.IsPrimary {
			logger.Debug("Returning primary screen", zap.Int("index", i))
			return i
		}
	}

	return 0
}