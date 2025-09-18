//go:build darwin
// +build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework AppKit
#import <Cocoa/Cocoa.h>
#import <AppKit/AppKit.h>
#import <dispatch/dispatch.h>

typedef struct {
    double x, y, width, height;
    int isPrimary;
    int index;
} ScreenInfo;

// Get all screens with their absolute positions
ScreenInfo* getAllScreensWithPosition(int* count) {
    @autoreleasepool {
        NSArray *screens = [NSScreen screens];
        *count = (int)[screens count];

        if (*count == 0) {
            return NULL;
        }

        ScreenInfo* result = (ScreenInfo*)malloc(sizeof(ScreenInfo) * (*count));

        NSScreen *mainScreen = [NSScreen mainScreen];

        for (int i = 0; i < *count; i++) {
            NSScreen *screen = [screens objectAtIndex:i];
            NSRect frame = [screen frame];

            result[i].x = frame.origin.x;
            result[i].y = frame.origin.y;
            result[i].width = frame.size.width;
            result[i].height = frame.size.height;
            result[i].isPrimary = (screen == mainScreen) ? 1 : 0;
            result[i].index = i;
        }

        return result;
    }
}

// Move window to absolute position
void moveWindowToAbsolutePosition(double x, double y) {
    // Ensure we're on the main thread
    if (![NSThread isMainThread]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            moveWindowToAbsolutePosition(x, y);
        });
        return;
    }

    @autoreleasepool {
        // Get the main window of the application
        NSApplication *app = [NSApplication sharedApplication];
        if (app == nil) {
            return;
        }

        NSWindow *window = [app mainWindow];

        if (window == nil) {
            // If no main window, try to get the first window
            NSArray *windows = [app windows];
            if (windows != nil && [windows count] > 0) {
                window = [windows objectAtIndex:0];
            }
        }

        if (window != nil) {
            NSRect frame = [window frame];
            frame.origin.x = x;
            frame.origin.y = y;

            // Use animate:NO for immediate positioning during startup
            [window setFrame:frame display:YES animate:NO];
        }
    }
}

// Get current window position (absolute coordinates)
void getCurrentWindowPosition(double* x, double* y, double* width, double* height) {
    // Initialize output values
    *x = 0;
    *y = 0;
    *width = 0;
    *height = 0;

    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        if (app == nil) {
            return;
        }

        NSWindow *window = [app mainWindow];

        if (window == nil) {
            NSArray *windows = [app windows];
            if (windows != nil && [windows count] > 0) {
                window = [windows objectAtIndex:0];
            }
        }

        if (window != nil) {
            NSRect frame = [window frame];
            *x = frame.origin.x;
            *y = frame.origin.y;
            *width = frame.size.width;
            *height = frame.size.height;
        }
    }
}

// Move window to specific screen at relative position
void moveWindowToScreen(int screenIndex, double relativeX, double relativeY) {
    // Ensure we're on the main thread
    if (![NSThread isMainThread]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            moveWindowToScreen(screenIndex, relativeX, relativeY);
        });
        return;
    }

    @autoreleasepool {
        NSArray *screens = [NSScreen screens];

        if (screens == nil) {
            return;
        }

        if (screenIndex >= 0 && screenIndex < [screens count]) {
            NSScreen *targetScreen = [screens objectAtIndex:screenIndex];
            if (targetScreen == nil) {
                return;
            }

            NSRect screenFrame = [targetScreen frame];

            // Calculate absolute position
            double absoluteX = screenFrame.origin.x + relativeX;
            double absoluteY = screenFrame.origin.y + relativeY;

            moveWindowToAbsolutePosition(absoluteX, absoluteY);
        }
    }
}

// Free allocated memory
void freeScreenInfo(ScreenInfo* info) {
    if (info != NULL) {
        free(info);
    }
}
*/
import "C"
import (
	"unsafe"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
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

// GetAllScreensWithPosition returns all screens with their absolute positions
func GetAllScreensWithPosition() []ScreenInfoExtended {
	var count C.int
	cScreens := C.getAllScreensWithPosition(&count)
	if cScreens == nil || count == 0 {
		logger.Warn("No screens found")
		return []ScreenInfoExtended{}
	}
	defer C.freeScreenInfo(cScreens)

	// Convert C array to Go slice
	screens := (*[1 << 30]C.ScreenInfo)(unsafe.Pointer(cScreens))[:count:count]
	result := make([]ScreenInfoExtended, count)

	for i := 0; i < int(count); i++ {
		result[i] = ScreenInfoExtended{
			X:         float64(screens[i].x),
			Y:         float64(screens[i].y),
			Width:     float64(screens[i].width),
			Height:    float64(screens[i].height),
			IsPrimary: screens[i].isPrimary != 0,
			Index:     int(screens[i].index),
		}

		logger.Debug("Screen info",
			zap.Int("index", result[i].Index),
			zap.Float64("x", result[i].X),
			zap.Float64("y", result[i].Y),
			zap.Float64("width", result[i].Width),
			zap.Float64("height", result[i].Height),
			zap.Bool("isPrimary", result[i].IsPrimary))
	}

	return result
}

// MoveWindowToAbsolutePosition moves the window to absolute coordinates
func MoveWindowToAbsolutePosition(x, y float64) {
	logger.Info("Moving window to absolute position",
		zap.Float64("x", x),
		zap.Float64("y", y))
	C.moveWindowToAbsolutePosition(C.double(x), C.double(y))
}

// GetCurrentWindowPosition returns the current window position in absolute coordinates
func GetCurrentWindowPosition() (x, y, width, height float64) {
	var cx, cy, cw, ch C.double
	C.getCurrentWindowPosition(&cx, &cy, &cw, &ch)
	return float64(cx), float64(cy), float64(cw), float64(ch)
}

// MoveWindowToScreen moves window to a specific screen at relative position
func MoveWindowToScreen(screenIndex int, relativeX, relativeY float64) {
	logger.Info("Moving window to screen",
		zap.Int("screenIndex", screenIndex),
		zap.Float64("relativeX", relativeX),
		zap.Float64("relativeY", relativeY))
	C.moveWindowToScreen(C.int(screenIndex), C.double(relativeX), C.double(relativeY))
}

// FindScreenContainingWindow finds which screen contains the window
func FindScreenContainingWindow(windowX, windowY, windowWidth, windowHeight float64) int {
	screens := GetAllScreensWithPosition()

	// Calculate window center point
	centerX := windowX + windowWidth/2
	centerY := windowY + windowHeight/2

	for _, screen := range screens {
		// Check if center point is within screen bounds
		if centerX >= screen.X && centerX < screen.X+screen.Width &&
		   centerY >= screen.Y && centerY < screen.Y+screen.Height {
			return screen.Index
		}
	}

	// If not found, return primary screen
	for _, screen := range screens {
		if screen.IsPrimary {
			return screen.Index
		}
	}

	return 0
}