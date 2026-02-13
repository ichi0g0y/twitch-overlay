//go:build linux
// +build linux

package main

import (
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
)

// ScreenInfoExtended represents screen information with position
type ScreenInfoExtended struct {
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
	IsPrimary bool    `json:"isPrimary"`
	Index     int     `json:"index"`
}

// GetAllScreensWithPosition returns empty slice on non-Darwin platforms
func GetAllScreensWithPosition() []ScreenInfoExtended {
	logger.Warn("GetAllScreensWithPosition is only supported on macOS")
	return []ScreenInfoExtended{}
}

// MoveWindowToAbsolutePosition does nothing on non-Darwin platforms
func MoveWindowToAbsolutePosition(x, y float64) {
	logger.Warn("MoveWindowToAbsolutePosition is only supported on macOS")
}

// GetCurrentWindowPosition returns zero values on non-Darwin platforms
func GetCurrentWindowPosition() (x, y, width, height float64) {
	logger.Warn("GetCurrentWindowPosition is only supported on macOS")
	return 0, 0, 0, 0
}

// MoveWindowToScreen does nothing on non-Darwin platforms
func MoveWindowToScreen(screenIndex int, relativeX, relativeY float64) {
	logger.Warn("MoveWindowToScreen is only supported on macOS")
}

// FindScreenContainingWindow returns 0 on non-Darwin platforms
func FindScreenContainingWindow(windowX, windowY, windowWidth, windowHeight float64) int {
	logger.Warn("FindScreenContainingWindow is only supported on macOS")
	return 0
}