package output

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/joeyak/go-twitch-eventsub/v3"
	"github.com/nantokaworks/twitch-overlay/internal/broadcast"
	"github.com/nantokaworks/twitch-overlay/internal/env"
	"github.com/nantokaworks/twitch-overlay/internal/faxmanager"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/shared/paths"
	"github.com/nantokaworks/twitch-overlay/internal/status"
	"go.uber.org/zap"
)

// PrintJob represents a print job with optional force flag
type PrintJob struct {
	Image image.Image
	Force bool // Force print even in dry-run mode
}

var printQueue chan PrintJob
var lastPrintTime time.Time
var lastPrintMutex sync.Mutex
var printerMutex sync.Mutex

// shouldUseDryRun determines if dry-run mode should be active
func shouldUseDryRun() bool {
	// If DryRunMode is explicitly set, always use it
	if env.Value.DryRunMode {
		logger.Debug("DryRunMode is explicitly enabled")
		return true
	}

	// If AutoDryRunWhenOffline is enabled and stream is offline, use dry-run
	if env.Value.AutoDryRunWhenOffline {
		isLive := status.IsStreamLive()
		logger.Debug("AUTO_DRY_RUN_WHEN_OFFLINE check",
			zap.Bool("auto_dry_run_enabled", true),
			zap.Bool("stream_is_live", isLive))

		if !isLive {
			logger.Info("AUTO_DRY_RUN_WHEN_OFFLINE: Stream is OFFLINE - enabling dry-run mode")
			return true
		} else {
			logger.Debug("AUTO_DRY_RUN_WHEN_OFFLINE: Stream is LIVE - dry-run mode disabled")
		}
	}

	return false
}

// InitializePrinter initializes the printer subsystem (including keep-alive and clock)
// This should be called from main() after env.Value is properly initialized
func InitializePrinter() {
	logger.Info("[InitializePrinter] Starting printer subsystem initialization",
		zap.Bool("keep_alive_enabled", env.Value.KeepAliveEnabled),
		zap.Int("keep_alive_interval", env.Value.KeepAliveInterval),
		zap.Bool("clock_enabled", env.Value.ClockEnabled),
		zap.String("printer_address", func() string {
			if env.Value.PrinterAddress != nil {
				return *env.Value.PrinterAddress
			}
			return "<not set>"
		}()))

	// Start keep-alive goroutine if enabled
	if env.Value.KeepAliveEnabled {
		logger.Info("[InitializePrinter] Starting keep-alive routine")
		go keepAliveRoutine()
	} else {
		logger.Info("[InitializePrinter] Keep-alive routine disabled")
	}

	// Start clock routine
	if env.Value.ClockEnabled {
		logger.Info("[InitializePrinter] Starting clock routine")
		go clockRoutine()
	} else {
		logger.Info("[InitializePrinter] Clock routine disabled")
	}

	logger.Info("[InitializePrinter] Printer subsystem initialization complete",
		zap.Bool("keep_alive_enabled", env.Value.KeepAliveEnabled),
		zap.Int("keep_alive_interval", env.Value.KeepAliveInterval),
		zap.Bool("clock_enabled", env.Value.ClockEnabled))
}

func init() {
	// Increase queue size for better safety margin (100 -> 1000)
	printQueue = make(chan PrintJob, 1000)

	// Initialize last print time to now
	lastPrintTime = time.Now()

	// Note: clockRoutine() is now called from InitializePrinter()
	// after env.Value is properly initialized

	go func() {
		for job := range printQueue {
			// Loop until printer is ready or job is processed (dropped or printed)
			for {
				// Lock printer for exclusive access
				printerMutex.Lock()

				// STRATEGY CHANGE: Connect-Print-Disconnect for every job
				// This ensures fresh printer state and prevents "faint print" issues caused by
				// state corruption during persistent connections.

				// 1. Ensure any existing connection is closed
				if IsConnected() {
					logger.Info("Closing existing connection to ensure fresh state")
					Stop()
					time.Sleep(1 * time.Second)
				}

				// 2. Check configuration
				if env.Value.PrinterAddress == nil || *env.Value.PrinterAddress == "" {
					logger.Warn("Printer address not configured, waiting 5s before retry...")
					printerMutex.Unlock()
					time.Sleep(5 * time.Second)
					continue
				}
				address := *env.Value.PrinterAddress

				// 3. Create fresh client
				c, err := SetupPrinter()
				if err != nil {
					logger.Error("Failed to setup printer client, waiting 5s before retry...", zap.Error(err))
					printerMutex.Unlock()
					time.Sleep(5 * time.Second)
					continue
				}

				// 4. Connect
				// Note: ConnectPrinter includes a stabilization delay
				logger.Info("Connecting to printer for single job", zap.String("address", address))
				err = ConnectPrinter(c, address)
				if err != nil {
					logger.Error("Failed to connect printer, waiting 5s before retry...", zap.Error(err))
					// Ensure cleanup
					Stop()
					printerMutex.Unlock()
					time.Sleep(5 * time.Second)
					continue
				}

				// 5. Setup Options (Force Refresh)
				SetupPrinterOptions(
					env.Value.BestQuality,
					env.Value.Dither,
					env.Value.AutoRotate,
					env.Value.BlackPoint,
				)

				// 6. Print (or Dry Run)
				// Check for dry-run mode
				if !job.Force && shouldUseDryRun() {
					if env.Value.AutoDryRunWhenOffline && !status.IsStreamLive() {
						logger.Info("Auto dry-run mode (stream offline): skipping actual printing")
					} else {
						logger.Info("Dry-run mode: skipping actual printing")
					}
					// Update last print time
					lastPrintMutex.Lock()
					lastPrintTime = time.Now()
					lastPrintMutex.Unlock()
				} else {
					// Rotate image if needed
					finalImg := job.Image
					if env.Value.RotatePrint {
						finalImg = rotateImage180(job.Image)
					}

					if job.Force {
						logger.Info("Force printing (ignoring dry-run mode)")
					}

					// Execute Print
					if err := c.Print(finalImg, opts, false); err != nil {
						logger.Error("Failed to print", zap.Error(err))
						// On print error, we still disconnect and retry?
						// Actually, if print fails, it might be connection issue.
						// We'll let the loop retry.
						Stop()
						printerMutex.Unlock()
						time.Sleep(5 * time.Second)
						continue
					} else {
						// Success
						lastPrintMutex.Lock()
						lastPrintTime = time.Now()
						lastPrintMutex.Unlock()

						// Wait for stabilization
						// Calculate dynamic wait time based on image height
						// Cat printers are slow (~10mm/s).
						// Assuming ~200dpi, 8px is roughly 1mm.
						// Safe estimate: 1 second per 50-100 pixels?
						// Let's use Base 2s + 1s per 60 pixels for safety.
						// 400px height -> 2 + 6 = 8s
						height := finalImg.Bounds().Dy()
						waitSec := 2 + (height / 60)
						if waitSec < 3 {
							waitSec = 3
						}

						logger.Info("Print finished, waiting for printer to stabilize...",
							zap.Int("height_px", height),
							zap.Int("wait_seconds", waitSec))

						time.Sleep(time.Duration(waitSec) * time.Second)
					}
				}

				// 7. Disconnect immediately
				logger.Info("Disconnecting after print job")
				Stop()

				// Release lock
				printerMutex.Unlock()

				// Break the retry loop as the job is done
				break
			}
		}
	}()
}

// PrintClock sends clock output to printer and frontend
func PrintClock(timeStr string) error {
	return PrintClockWithOptions(timeStr, false)
}

// PrintClockWithOptions sends clock output to printer and frontend with options
func PrintClockWithOptions(timeStr string, forceEmptyLeaderboard bool) error {
	return PrintClockWithOptionsForce(timeStr, forceEmptyLeaderboard, false)
}

// PrintClockWithOptionsForce sends clock output with force print option
func PrintClockWithOptionsForce(timeStr string, forceEmptyLeaderboard bool, forcePrint bool) error {
	// Generate color version
	colorImg, err := GenerateTimeImageWithStatsColorOptions(timeStr, forceEmptyLeaderboard)
	if err != nil {
		return fmt.Errorf("failed to create color clock image: %w", err)
	}

	// Generate monochrome version for printing
	monoImg, err := GenerateTimeImageWithStatsOptions(timeStr, forceEmptyLeaderboard)
	if err != nil {
		return fmt.Errorf("failed to create monochrome clock image: %w", err)
	}

	// Save fax with faxmanager (use "System" as username for clock, no avatar)
	fax, err := faxmanager.SaveFax("🕐 Clock", timeStr, "", "", colorImg, monoImg)
	if err != nil {
		return fmt.Errorf("failed to save clock fax: %w", err)
	}

	// Save images to disk
	if err := saveFaxImages(fax, colorImg, monoImg); err != nil {
		return fmt.Errorf("failed to save clock fax images: %w", err)
	}

	// Broadcast to SSE clients
	broadcast.BroadcastFax(fax)

	// Add to print queue with force flag
	enqueuePrintJob(PrintJob{
		Image: monoImg,
		Force: forcePrint,
	})
	return nil
}

func PrintOut(userName string, message []twitch.ChatMessageFragment, avatarURL string, timestamp time.Time) error {
	// Generate color version
	colorImg, err := MessageToImage(userName, message, avatarURL, true)
	if err != nil {
		return fmt.Errorf("failed to create color image: %w", err)
	}

	// Generate monochrome version for printing
	monoImg, err := MessageToImage(userName, message, avatarURL, false)
	if err != nil {
		return fmt.Errorf("failed to create monochrome image: %w", err)
	}

	// Extract message text from fragments
	messageText := ""
	for _, fragment := range message {
		if fragment.Type == "text" {
			messageText += fragment.Text
		}
	}

	// Save fax with faxmanager
	fax, err := faxmanager.SaveFax(userName, messageText, "", avatarURL, colorImg, monoImg)
	if err != nil {
		return fmt.Errorf("failed to save fax: %w", err)
	}

	// Save images to disk
	if err := saveFaxImages(fax, colorImg, monoImg); err != nil {
		return fmt.Errorf("failed to save fax images: %w", err)
	}

	// Broadcast to SSE clients
	broadcast.BroadcastFax(fax)

	// Add to print queue
	enqueuePrintJob(PrintJob{
		Image: monoImg,
		Force: false,
	})
	return nil
}

// PrintOutWithTitle sends fax output with separate title and details to printer and frontend
func PrintOutWithTitle(title, userName, extra, details string, avatarURL string, timestamp time.Time) error {
	// Generate color version
	colorImg, err := MessageToImageWithTitle(title, userName, extra, details, avatarURL, true)
	if err != nil {
		return fmt.Errorf("failed to create color image: %w", err)
	}

	// Generate monochrome version for printing
	monoImg, err := MessageToImageWithTitle(title, userName, extra, details, avatarURL, false)
	if err != nil {
		return fmt.Errorf("failed to create monochrome image: %w", err)
	}

	// Create display text for fax manager
	messageText := title
	if extra != "" {
		messageText += "\n" + extra
	}
	if details != "" {
		messageText += "\n" + details
	}

	// Save fax with faxmanager
	fax, err := faxmanager.SaveFax(userName, messageText, "", avatarURL, colorImg, monoImg)
	if err != nil {
		return fmt.Errorf("failed to save fax: %w", err)
	}

	// Save images to disk
	if err := saveFaxImages(fax, colorImg, monoImg); err != nil {
		return fmt.Errorf("failed to save fax images: %w", err)
	}

	// Broadcast to SSE clients
	broadcast.BroadcastFax(fax)

	// Add to print queue
	enqueuePrintJob(PrintJob{
		Image: monoImg,
		Force: false,
	})
	return nil
}

// enqueuePrintJob adds a job to the queue safely (non-blocking)
func enqueuePrintJob(job PrintJob) {
	select {
	case printQueue <- job:
		// success
	default:
		logger.Error("Print queue is full, dropping job")
	}
}

// saveFaxImages saves the fax images to disk
func saveFaxImages(fax *faxmanager.Fax, colorImg, monoImg image.Image) error {
	// Save color image
	colorFile, err := os.Create(fax.ColorPath)
	if err != nil {
		return fmt.Errorf("failed to create color file: %w", err)
	}
	defer colorFile.Close()

	if err := png.Encode(colorFile, colorImg); err != nil {
		return fmt.Errorf("failed to encode color image: %w", err)
	}

	// Save mono image
	monoFile, err := os.Create(fax.MonoPath)
	if err != nil {
		return fmt.Errorf("failed to create mono file: %w", err)
	}
	defer monoFile.Close()

	if err := png.Encode(monoFile, monoImg); err != nil {
		return fmt.Errorf("failed to encode mono image: %w", err)
	}

	if shouldUseDryRun() {
		if env.Value.AutoDryRunWhenOffline && !status.IsStreamLive() {
			logger.Info("Fax images saved (AUTO DRY-RUN: STREAM OFFLINE)",
				zap.String("id", fax.ID),
				zap.String("colorPath", fax.ColorPath),
				zap.String("monoPath", fax.MonoPath))
		} else {
			logger.Info("Fax images saved (DRY-RUN MODE)",
				zap.String("id", fax.ID),
				zap.String("colorPath", fax.ColorPath),
				zap.String("monoPath", fax.MonoPath))
		}
	} else {
		logger.Info("Fax images saved",
			zap.String("id", fax.ID),
			zap.String("colorPath", fax.ColorPath),
			zap.String("monoPath", fax.MonoPath))
	}

	return nil
}

func clockRoutine() {
	logger.Info("Clock routine started",
		zap.Bool("enabled", env.Value.ClockEnabled))

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	lastPrintedTime := ""
	lastMonth := time.Now().Format("2006-01")

	for range ticker.C {
		now := time.Now()
		minute := now.Minute()
		currentMonth := now.Format("2006-01")

		// Check if month has changed
		if currentMonth != lastMonth {
			logger.Info("Month changed",
				zap.String("from", lastMonth),
				zap.String("to", currentMonth))
			lastMonth = currentMonth
		}

		// Check if it's 0 minutes (on the hour)
		if minute == 0 {
			currentTimeStr := now.Format("15:04")

			// Avoid printing the same time multiple times
			if currentTimeStr != lastPrintedTime {
				lastPrintedTime = currentTimeStr

				logger.Info("Clock: printing time with latest leaderboard data", zap.String("time", currentTimeStr))

				// Use PrintClock to handle everything (generation, saving, broadcasting, and printing)
				if err := PrintClock(currentTimeStr); err != nil {
					logger.Error("Clock: failed to print clock", zap.Error(err))
				} else {
					logger.Info("Clock: successfully printed and broadcasted")
				}
			}
		}

	}
}

// keepAliveRoutine maintains printer connection
// DISABLED: This routine interferes with the Connect-Print-Disconnect strategy.
func keepAliveRoutine() {
	// Periodic logging to confirm it's disabled if needed, or just return.
	// We'll log once on startup (which happens when this is called).
	logger.Info("KeepAlive routine is DISABLED due to Connect-Print-Disconnect strategy")
	return
}

// PrintInitialClock prints initial clock on startup
func PrintInitialClock() error {
	now := time.Now()
	currentTime := now.Format("15:04")
	logger.Info("Printing initial clock (simple)", zap.String("time", currentTime))

	// Generate simple time-only image
	img, err := GenerateTimeImageSimple(currentTime)
	if err != nil {
		return fmt.Errorf("failed to generate initial clock image: %w", err)
	}

	// Save image if debug output is enabled
	if env.Value.DebugOutput {
		outputDir := paths.GetOutputDir()
		if err := os.MkdirAll(outputDir, 0755); err != nil {
			return fmt.Errorf("failed to create output directory: %w", err)
		}

		// Save time-only image
		monoPath := filepath.Join(outputDir, fmt.Sprintf("%s_initial_clock.png", now.Format("20060102_150405")))
		file, err := os.Create(monoPath)
		if err != nil {
			return fmt.Errorf("failed to create output file: %w", err)
		}
		defer file.Close()
		if err := png.Encode(file, img); err != nil {
			return fmt.Errorf("failed to encode image: %w", err)
		}
		logger.Info("Initial clock: output file saved", zap.String("path", monoPath))

		// Return early when debug output is enabled (skip print queue)
		return nil
	}

	// Directly add to print queue without frontend notification
	// This is the only output that doesn't notify the frontend
	select {
	case printQueue <- PrintJob{Image: img, Force: false}:
		logger.Info("Initial clock added to print queue (no frontend notification)")
	default:
		return fmt.Errorf("print queue is full")
	}

	return nil
}

// GetPrintQueueSize returns the current number of items in the print queue
func GetPrintQueueSize() int {
	return len(printQueue)
}
