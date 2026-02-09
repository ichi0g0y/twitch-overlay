package main

import (
	"fmt"
	"strings"

	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/output"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/status"
	"github.com/ichi0g0y/twitch-overlay/internal/translation"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"go.uber.org/zap"
)

func migrateLegacyTranslationSettings() {
	db := localdb.GetDB()
	if db == nil {
		return
	}
	manager := settings.NewSettingsManager(db)
	migrateValue := func(key string) {
		value, err := manager.GetRealValue(key)
		if err != nil {
			return
		}
		normalized := strings.TrimSpace(strings.ToLower(value))
		if normalized == "nllb" || normalized == "local" {
			_ = manager.SetSetting(key, "ollama")
		}
	}
	migrateValue("MIC_TRANSCRIPT_TRANSLATION_MODE")

	migrateLang := func(key string) {
		value, err := manager.GetRealValue(key)
		if err != nil {
			return
		}
		normalized := translation.NormalizeFromLangTag(value)
		if normalized == "" {
			normalized = translation.NormalizeLanguageCode(value)
		}
		if normalized != "" && normalized != value {
			_ = manager.SetSetting(key, normalized)
		}
	}
	migrateLang("MIC_TRANSCRIPT_TRANSLATION_LANGUAGE")

	migrateOllamaModel := func() {
		value, err := manager.GetRealValue("OLLAMA_MODEL")
		if err != nil {
			return
		}
		normalized := strings.TrimSpace(strings.ToLower(value))
		var next string
		switch normalized {
		case "shisa-ai/shisa-v2.1-qwen3-8b", "shisa-v2.1-qwen3-8b":
			next = "hf.co/XpressAI/shisa-v2.1-qwen3-8b-GGUF:Q4_K_M"
		case "shisa-ai/shisa-v2.1-llama3.2-3b", "shisa-v2.1-llama3.2-3b":
			next = "hf.co/XpressAI/shisa-v2.1-llama3.2-3b-GGUF:Q4_K_M"
		case "shisa-ai/shisa-v2.1-unphi4-14b", "shisa-v2.1-unphi4-14b":
			next = "hf.co/mradermacher/shisa-v2.1-unphi4-14b-GGUF:Q4_K_M"
		}
		if next != "" && value != next {
			_ = manager.SetSetting("OLLAMA_MODEL", next)
		}
	}
	migrateOllamaModel()
}

func checkInitialStreamStatus() {
	logger.Info("Checking initial stream status...")

	if env.Value.TwitchUserID == nil || *env.Value.TwitchUserID == "" {
		logger.Warn("Cannot check stream status: Twitch user ID not configured")
		return
	}

	streamInfo, err := twitchapi.GetStreamInfo()
	if err != nil {
		logger.Error("Failed to get initial stream status", zap.Error(err))
		return
	}

	if streamInfo.IsLive {
		logger.Info("Stream is currently LIVE on startup, updating status",
			zap.Int("viewer_count", streamInfo.ViewerCount))
		status.UpdateStreamStatus(true, nil, streamInfo.ViewerCount)
		if env.Value.AutoDryRunWhenOffline {
			logger.Info("AUTO_DRY_RUN_WHEN_OFFLINE is enabled, but stream is LIVE - dry-run disabled")
		}
		return
	}

	logger.Info("Stream is OFFLINE on startup")
	status.SetStreamOffline()
	if env.Value.AutoDryRunWhenOffline {
		logger.Info("AUTO_DRY_RUN_WHEN_OFFLINE is enabled and stream is OFFLINE - dry-run will be active")
	}
}

func initializeBluetoothPrinter() error {
	if env.Value.PrinterType != "bluetooth" {
		return fmt.Errorf("bluetooth printer is not selected")
	}

	logger.Info("Initializing Bluetooth printer...")

	if output.IsBluetoothConnected() {
		logger.Info("Disconnecting existing printer connection")
		output.StopBluetoothClient()
	}

	client, err := output.SetupBluetoothClient()
	if err != nil {
		return fmt.Errorf("failed to setup printer: %w", err)
	}

	output.SetupBluetoothOptions(
		env.Value.BestQuality,
		env.Value.Dither,
		env.Value.AutoRotate,
		env.Value.BlackPoint,
	)

	if env.Value.PrinterAddress == nil || *env.Value.PrinterAddress == "" {
		return fmt.Errorf("printer address not configured")
	}

	if err := output.ConnectBluetoothPrinter(client, *env.Value.PrinterAddress); err != nil {
		return fmt.Errorf("failed to connect to printer: %w", err)
	}

	logger.Info("Printer connected successfully")
	return nil
}

