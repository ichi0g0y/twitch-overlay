package micrecog

import (
	"strconv"
	"strings"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

type Config struct {
	Enabled           bool
	Device            string
	MicIndex          *int
	Model             string
	Language          string
	VadEnabled        bool
	VadThreshold      float64
	NoSpeechThreshold float64
	LogprobThreshold  float64
	ExcludePhrases    []string
	InterimEnabled    bool
	InterimSeconds    float64
	InterimWindow     float64
	InterimMinSeconds float64
	VadEndMs          int
	VadPreRollMs      int
}

func DefaultConfig() Config {
	return Config{
		Enabled:           true,
		Device:            "auto",
		Model:             "large-v3",
		Language:          "ja",
		VadEnabled:        true,
		VadThreshold:      0.7,
		NoSpeechThreshold: 0.85,
		LogprobThreshold:  -0.3,
		ExcludePhrases:    []string{"ご視聴ありがとうございました"},
		InterimEnabled:    true,
		InterimSeconds:    0.5,
		InterimWindow:     3,
		InterimMinSeconds: 1,
		VadEndMs:          600,
		VadPreRollMs:      150,
	}
}

func LoadConfig() Config {
	cfg := DefaultConfig()
	db := localdb.GetDB()
	if db == nil {
		logger.Warn("mic-recog config: database not initialized, using defaults")
		return cfg
	}

	manager := settings.NewSettingsManager(db)

	cfg.Enabled = parseBool(getSetting(manager, "MIC_RECOG_ENABLED"), cfg.Enabled)
	cfg.Device = normalizeDevice(getSetting(manager, "MIC_RECOG_DEVICE"), cfg.Device)
	cfg.Model = getSettingOrDefault(manager, "MIC_RECOG_MODEL", cfg.Model)
	cfg.Language = getSetting(manager, "MIC_RECOG_LANGUAGE")
	cfg.VadEnabled = parseBool(getSetting(manager, "MIC_RECOG_VAD"), cfg.VadEnabled)
	cfg.VadThreshold = parseFloat(getSetting(manager, "MIC_RECOG_VAD_THRESHOLD"), cfg.VadThreshold)
	cfg.NoSpeechThreshold = parseFloat(getSetting(manager, "MIC_RECOG_NO_SPEECH_THRESHOLD"), cfg.NoSpeechThreshold)
	cfg.LogprobThreshold = parseFloat(getSetting(manager, "MIC_RECOG_LOGPROB_THRESHOLD"), cfg.LogprobThreshold)
	cfg.ExcludePhrases = parseList(getSetting(manager, "MIC_RECOG_EXCLUDE"))
	cfg.InterimEnabled = parseBool(getSetting(manager, "MIC_RECOG_INTERIM"), cfg.InterimEnabled)
	cfg.InterimSeconds = parseFloat(getSetting(manager, "MIC_RECOG_INTERIM_SECONDS"), cfg.InterimSeconds)
	cfg.InterimWindow = parseFloat(getSetting(manager, "MIC_RECOG_INTERIM_WINDOW_SECONDS"), cfg.InterimWindow)
	cfg.InterimMinSeconds = parseFloat(getSetting(manager, "MIC_RECOG_INTERIM_MIN_SECONDS"), cfg.InterimMinSeconds)
	cfg.VadEndMs = parseInt(getSetting(manager, "MIC_RECOG_VAD_END_MS"), cfg.VadEndMs)
	cfg.VadPreRollMs = parseInt(getSetting(manager, "MIC_RECOG_VAD_PRE_ROLL_MS"), cfg.VadPreRollMs)

	if raw := strings.TrimSpace(getSetting(manager, "MIC_RECOG_MIC_INDEX")); raw != "" {
		if idx, err := strconv.Atoi(raw); err == nil && idx >= 0 {
			cfg.MicIndex = &idx
		}
	}

	return cfg
}

func (c Config) Args() []string {
	args := []string{
		"-m", c.Model,
	}

	if c.Language != "" {
		args = append(args, "-l", c.Language)
	}
	if c.Device != "" {
		args = append(args, "--device", c.Device)
	}
	if c.MicIndex != nil {
		args = append(args, "--mic", strconv.Itoa(*c.MicIndex))
	}
	if c.VadEnabled {
		args = append(args,
			"--vad",
			"--vad-threshold", formatFloat(c.VadThreshold),
			"--vad-end-ms", strconv.Itoa(c.VadEndMs),
			"--vad-pre-roll-ms", strconv.Itoa(c.VadPreRollMs),
		)
	}
	args = append(args,
		"--no-speech-threshold", formatFloat(c.NoSpeechThreshold),
		"--logprob-threshold", formatFloat(c.LogprobThreshold),
	)
	if c.InterimEnabled {
		args = append(args,
			"--interim",
			"--interim-seconds", formatFloat(c.InterimSeconds),
			"--interim-window-seconds", formatFloat(c.InterimWindow),
			"--interim-min-seconds", formatFloat(c.InterimMinSeconds),
		)
	}
	for _, phrase := range c.ExcludePhrases {
		if phrase == "" {
			continue
		}
		args = append(args, "--exclude", phrase)
	}
	return args
}

func getSetting(manager *settings.SettingsManager, key string) string {
	value, err := manager.GetRealValue(key)
	if err != nil {
		logger.Debug("mic-recog settings read failed", zap.String("key", key), zap.Error(err))
		return ""
	}
	return strings.TrimSpace(value)
}

func getSettingOrDefault(manager *settings.SettingsManager, key string, fallback string) string {
	value := getSetting(manager, key)
	if value == "" {
		return fallback
	}
	return value
}

func parseBool(raw string, fallback bool) bool {
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return value
}

func parseFloat(raw string, fallback float64) float64 {
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	return value
}

func parseInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func normalizeDevice(raw string, fallback string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "auto", "cpu", "cuda", "mps":
		return value
	case "":
		return fallback
	default:
		return fallback
	}
}

func parseList(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}
	}
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == '\t'
	})
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		items = append(items, item)
	}
	return items
}
