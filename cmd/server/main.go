package main

import (
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/cache"
	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/faxmanager"
	"github.com/ichi0g0y/twitch-overlay/internal/fontmanager"
	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/music"
	"github.com/ichi0g0y/twitch-overlay/internal/output"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/paths"
	"github.com/ichi0g0y/twitch-overlay/internal/twitcheventsub"
	"github.com/ichi0g0y/twitch-overlay/internal/webserver"
	"go.uber.org/zap"
)

func main() {
	logger.Init(false)
	defer logger.Sync()

	logger.Info("Starting twitch-overlay server (headless/WebUI mode)")

	if err := paths.EnsureDataDirs(); err != nil {
		logger.Fatal("Failed to ensure data directories", zap.Error(err))
	}

	if _, err := localdb.SetupDB(paths.GetDBPath()); err != nil {
		logger.Fatal("Failed to setup database", zap.Error(err))
	}

	if err := localdb.FixEntryCountsOver3(); err != nil {
		logger.Warn("Failed to fix entry counts over 3", zap.Error(err))
	}

	migrateLegacyTranslationSettings()

	// env.LoadEnv must run after DB initialization.
	env.LoadEnv()
	if env.Value.DebugMode {
		logger.Init(true)
		logger.Info("Debug mode enabled")
	}

	if err := webserver.LoadLotteryParticipantsFromDB(); err != nil {
		logger.Warn("Failed to load lottery participants from database", zap.Error(err))
	}
	if err := webserver.InitializePresentLottery(); err != nil {
		logger.Warn("Failed to initialize present lottery lock state", zap.Error(err))
	}

	faxmanager.InitializeDataDir()

	if err := fontmanager.Initialize(); err != nil {
		logger.Error("Failed to initialize font manager", zap.Error(err))
	}

	if disableCache := os.Getenv("DISABLE_CACHE"); disableCache == "true" {
		logger.Info("Cache system disabled by environment variable DISABLE_CACHE=true")
	} else if err := cache.InitializeCache(); err != nil {
		logger.Error("Failed to initialize cache system", zap.Error(err))
	}

	if err := music.InitMusicDB(); err != nil {
		logger.Error("Failed to initialize music database", zap.Error(err))
	}

	output.InitializePrinter()

	port := 8080
	if env.Value.ServerPort != 0 {
		port = env.Value.ServerPort
	}

	webserver.InitOverlaySettings()

	if err := webserver.StartWebServer(port); err != nil {
		logger.Fatal("Failed to start web server", zap.Error(err))
	}

	// macOS: Trigger CoreBluetooth access early so the OS shows the permission prompt
	// on launch (Allow/Don't Allow). This avoids the first scan being the moment of failure.
	if runtime.GOOS == "darwin" && env.Value.PrinterType == "bluetooth" {
		go func() {
			// Small delay to avoid flaky ManagerStateUnknown right at process start.
			time.Sleep(2 * time.Second)

			logger.Info("Bluetooth permission preflight started (may show an Allow prompt on macOS)")
			c, err := output.SetupBluetoothScannerClient()
			if err != nil {
				logger.Warn("Bluetooth permission preflight failed", zap.Error(err))
				return
			}
			defer c.Stop()

			// Short scan just to touch the stack; we don't care about results here.
			c.Timeout = 2 * time.Second
			if _, err := c.ScanDevices(""); err != nil {
				logger.Warn("Bluetooth permission preflight scan failed", zap.Error(err))
				return
			}

			logger.Info("Bluetooth permission preflight completed")
		}()
	}

	tokenRefreshDone := make(chan struct{})
	startTwitchBackground(tokenRefreshDone)

	// NOTE: On macOS, touching Bluetooth from a non-bundled CLI can SIGABRT if the process
	// does not have an Info.plist with the required usage descriptions. Avoid auto-connect
	// by default; connect explicitly via the API or run the bundled desktop app.
	autoConnectPrinter := true
	if runtime.GOOS == "darwin" {
		autoConnectPrinter = os.Getenv("AUTO_CONNECT_PRINTER") == "true"
		if !autoConnectPrinter {
			logger.Info("Skipping Bluetooth printer auto-connect on macOS (set AUTO_CONNECT_PRINTER=true to enable)")
		}
	}

	// Bluetooth printer initial connect (only when KeepAlive is disabled).
	if autoConnectPrinter && env.Value.PrinterType == "bluetooth" && env.Value.PrinterAddress != nil && *env.Value.PrinterAddress != "" {
		go func() {
			if !env.Value.KeepAliveEnabled {
				logger.Info("KeepAlive is disabled, attempting manual printer connection")
				if err := initializeBluetoothPrinter(); err != nil {
					logger.Error("Failed to initialize printer", zap.Error(err))
				}
			} else {
				logger.Info("KeepAlive is enabled, printer will be connected automatically by keepAliveRoutine")
			}
		}()
	}

	logger.Info("Server started",
		zap.Int("port", port),
		zap.String("webui", fmt.Sprintf("http://localhost:%d/", port)),
		zap.String("overlay", fmt.Sprintf("http://localhost:%d/overlay/", port)))

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	logger.Info("Shutting down...")

	close(tokenRefreshDone)
	twitcheventsub.Stop()
	webserver.Shutdown()
	output.StopBluetoothClient()

	logger.Info("Shutdown complete")
}
