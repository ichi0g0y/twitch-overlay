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
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"go.uber.org/zap"
)

func migrateLegacyTranslationSettings() {
	db := localdb.GetDB()
	if db == nil {
		return
	}
	manager := settings.NewSettingsManager(db)

	migrateMode := func(key string) {
		value, err := manager.GetRealValue(key)
		if err != nil {
			return
		}
		normalized := strings.TrimSpace(strings.ToLower(value))
		switch normalized {
		case "", "off", "chrome":
			return
		default:
			// Unknown legacy mode -> prefer Chrome translation for browser-only flow.
			_ = manager.SetSetting(key, "chrome")
		}
	}
	migrateMode("MIC_TRANSCRIPT_TRANSLATION_MODE")

	normalizeChromeLanguageCode := func(value string) string {
		raw := strings.TrimSpace(value)
		if raw == "" {
			return ""
		}
		normalized := strings.ToLower(raw)

		normalized = strings.ReplaceAll(normalized, "_", "-")
		if strings.Contains(normalized, "-") {
			parts := strings.Split(normalized, "-")
			if len(parts) >= 2 && parts[0] == "zh" {
				if parts[1] == "tw" || parts[1] == "hk" || parts[1] == "hant" {
					return "zh-Hant"
				}
			}
			if len(parts) >= 1 {
				normalized = parts[0]
			}
		}

		switch normalized {
		case "eng", "en":
			return "en"
		case "jpn", "ja":
			return "ja"
		case "zho", "cmn", "zh":
			return "zh"
		case "kor", "ko":
			return "ko"
		case "fra", "fr":
			return "fr"
		case "deu", "de":
			return "de"
		case "spa", "es":
			return "es"
		case "por", "pt":
			return "pt"
		case "rus", "ru":
			return "ru"
		case "ita", "it":
			return "it"
		case "ind", "id":
			return "id"
		case "tha", "th":
			return "th"
		case "vie", "vi":
			return "vi"
		case "nld", "nl":
			return "nl"
		case "pol", "pl":
			return "pl"
		case "tur", "tr":
			return "tr"
		case "ukr", "uk":
			return "uk"
		case "ell", "el":
			return "el"
		case "som", "so":
			return "so"
		}

		if len(normalized) == 2 {
			return normalized
		}
		if normalized == "zh-hant" {
			return "zh-Hant"
		}
		if raw == "zh-Hant" {
			return raw
		}
		return ""
	}

	migrateLang := func(key string) {
		value, err := manager.GetRealValue(key)
		if err != nil {
			return
		}
		next := normalizeChromeLanguageCode(value)
		if next != "" && next != value {
			_ = manager.SetSetting(key, next)
		}
	}

	migrateLang("MIC_TRANSCRIPT_TRANSLATION_LANGUAGE")
	migrateLang("MIC_TRANSCRIPT_TRANSLATION2_LANGUAGE")
	migrateLang("MIC_TRANSCRIPT_TRANSLATION3_LANGUAGE")
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
