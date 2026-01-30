package settings

import (
	"database/sql"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

type SettingType string

const (
	SettingTypeNormal SettingType = "normal"
	SettingTypeSecret SettingType = "secret"
)

type Setting struct {
	Key         string      `json:"key"`
	Value       string      `json:"value"`
	Type        SettingType `json:"type"`
	Required    bool        `json:"required"`
	Description string      `json:"description"`
	UpdatedAt   time.Time   `json:"updated_at"`
	HasValue    bool        `json:"has_value"` // シークレット値が設定されているかどうか
}

type SettingsManager struct {
	db *sql.DB
}

func NewSettingsManager(db *sql.DB) *SettingsManager {
	return &SettingsManager{db: db}
}

// 設定の定義
var DefaultSettings = map[string]Setting{
	// Twitch設定（機密情報）
	"CLIENT_ID": {
		Key: "CLIENT_ID", Value: "", Type: SettingTypeSecret, Required: true,
		Description: "Twitch API Client ID",
	},
	"CLIENT_SECRET": {
		Key: "CLIENT_SECRET", Value: "", Type: SettingTypeSecret, Required: true,
		Description: "Twitch API Client Secret",
	},
	"TWITCH_USER_ID": {
		Key: "TWITCH_USER_ID", Value: "", Type: SettingTypeSecret, Required: true,
		Description: "Twitch User ID for monitoring",
	},
	"TRIGGER_CUSTOM_REWORD_ID": {
		Key: "TRIGGER_CUSTOM_REWORD_ID", Value: "", Type: SettingTypeSecret, Required: true,
		Description: "Custom Reward ID for triggering FAX",
	},
	"OPENAI_API_KEY": {
		Key: "OPENAI_API_KEY", Value: "", Type: SettingTypeSecret, Required: false,
		Description: "OpenAI API key for chat translation",
	},
	"OPENAI_MODEL": {
		Key: "OPENAI_MODEL", Value: "gpt-4o-mini", Type: SettingTypeNormal, Required: false,
		Description: "OpenAI model for chat translation",
	},
	"TRANSLATION_BACKEND": {
		Key: "TRANSLATION_BACKEND", Value: "openai", Type: SettingTypeNormal, Required: false,
		Description: "Translation backend (openai/ollama)",
	},
	"OLLAMA_BASE_URL": {
		Key: "OLLAMA_BASE_URL", Value: "http://127.0.0.1:11434", Type: SettingTypeNormal, Required: false,
		Description: "Ollama base URL",
	},
	"OLLAMA_MODEL": {
		Key: "OLLAMA_MODEL", Value: "translategemma:12b", Type: SettingTypeNormal, Required: false,
		Description: "Ollama model name",
	},
	"OLLAMA_BASE_MODEL": {
		Key: "OLLAMA_BASE_MODEL", Value: "translategemma:12b", Type: SettingTypeNormal, Required: false,
		Description: "Ollama base model for modelfile",
	},
	"OLLAMA_CUSTOM_MODEL_NAME": {
		Key: "OLLAMA_CUSTOM_MODEL_NAME", Value: "translator-custom", Type: SettingTypeNormal, Required: false,
		Description: "Ollama modelfile output model name",
	},
	"OLLAMA_NUM_PREDICT": {
		Key: "OLLAMA_NUM_PREDICT", Value: "128", Type: SettingTypeNormal, Required: false,
		Description: "Ollama num_predict per request",
	},
	"OLLAMA_TEMPERATURE": {
		Key: "OLLAMA_TEMPERATURE", Value: "0.1", Type: SettingTypeNormal, Required: false,
		Description: "Ollama temperature (0.0 - 2.0)",
	},
	"OLLAMA_TOP_P": {
		Key: "OLLAMA_TOP_P", Value: "0.9", Type: SettingTypeNormal, Required: false,
		Description: "Ollama top_p (0.0 - 1.0)",
	},
	"OLLAMA_NUM_CTX": {
		Key: "OLLAMA_NUM_CTX", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Ollama num_ctx (optional)",
	},
	"OLLAMA_STOP": {
		Key: "OLLAMA_STOP", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Ollama stop sequences (comma or newline separated)",
	},
	"OLLAMA_SYSTEM_PROMPT": {
		Key: "OLLAMA_SYSTEM_PROMPT", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Ollama system prompt (optional)",
	},
	"OPENAI_USAGE_INPUT_TOKENS": {
		Key: "OPENAI_USAGE_INPUT_TOKENS", Value: "0", Type: SettingTypeNormal, Required: false,
		Description: "Accumulated OpenAI input tokens",
	},
	"OPENAI_USAGE_OUTPUT_TOKENS": {
		Key: "OPENAI_USAGE_OUTPUT_TOKENS", Value: "0", Type: SettingTypeNormal, Required: false,
		Description: "Accumulated OpenAI output tokens",
	},
	"OPENAI_USAGE_COST_USD": {
		Key: "OPENAI_USAGE_COST_USD", Value: "0", Type: SettingTypeNormal, Required: false,
		Description: "Estimated OpenAI usage cost in USD",
	},
	"OPENAI_USAGE_DAILY_DATE": {
		Key: "OPENAI_USAGE_DAILY_DATE", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Daily usage date (YYYY-MM-DD)",
	},
	"OPENAI_USAGE_DAILY_INPUT_TOKENS": {
		Key: "OPENAI_USAGE_DAILY_INPUT_TOKENS", Value: "0", Type: SettingTypeNormal, Required: false,
		Description: "Daily OpenAI input tokens",
	},
	"OPENAI_USAGE_DAILY_OUTPUT_TOKENS": {
		Key: "OPENAI_USAGE_DAILY_OUTPUT_TOKENS", Value: "0", Type: SettingTypeNormal, Required: false,
		Description: "Daily OpenAI output tokens",
	},
	"OPENAI_USAGE_DAILY_COST_USD": {
		Key: "OPENAI_USAGE_DAILY_COST_USD", Value: "0", Type: SettingTypeNormal, Required: false,
		Description: "Daily OpenAI usage cost in USD",
	},
	"CHAT_TRANSLATION_ENABLED": {
		Key: "CHAT_TRANSLATION_ENABLED", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable chat translation",
	},

	// プリンター設定
	"PRINTER_TYPE": {
		Key: "PRINTER_TYPE", Value: "bluetooth", Type: SettingTypeNormal, Required: false,
		Description: "Printer type (bluetooth or usb)",
	},
	"PRINTER_ADDRESS": {
		Key: "PRINTER_ADDRESS", Value: "", Type: SettingTypeNormal, Required: true,
		Description: "Bluetooth MAC address of the printer",
	},
	"USB_PRINTER_NAME": {
		Key: "USB_PRINTER_NAME", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "System printer name for USB printing",
	},
	"DRY_RUN_MODE": {
		Key: "DRY_RUN_MODE", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable dry run mode (no actual printing)",
	},
	"BEST_QUALITY": {
		Key: "BEST_QUALITY", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable best quality printing",
	},
	"DITHER": {
		Key: "DITHER", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable dithering",
	},
	"BLACK_POINT": {
		Key: "BLACK_POINT", Value: "0.5", Type: SettingTypeNormal, Required: false,
		Description: "Black point threshold (0.0-1.0)",
	},
	"AUTO_ROTATE": {
		Key: "AUTO_ROTATE", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Auto rotate images",
	},
	"ROTATE_PRINT": {
		Key: "ROTATE_PRINT", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Rotate print output 180 degrees",
	},

	// 動作設定
	"KEEP_ALIVE_INTERVAL": {
		Key: "KEEP_ALIVE_INTERVAL", Value: "60", Type: SettingTypeNormal, Required: false,
		Description: "Keep alive interval in seconds",
	},
	"KEEP_ALIVE_ENABLED": {
		Key: "KEEP_ALIVE_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable keep alive functionality",
	},
	"CLOCK_ENABLED": {
		Key: "CLOCK_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable clock printing",
	},
	"CLOCK_SHOW_ICONS": {
		Key: "CLOCK_SHOW_ICONS", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Show icons in clock display",
	},
	"DEBUG_OUTPUT": {
		Key: "DEBUG_OUTPUT", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable debug output",
	},
	"TIMEZONE": {
		Key: "TIMEZONE", Value: "Asia/Tokyo", Type: SettingTypeNormal, Required: false,
		Description: "Timezone for clock display",
	},
	"AUTO_DRY_RUN_WHEN_OFFLINE": {
		Key: "AUTO_DRY_RUN_WHEN_OFFLINE", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Automatically enable dry-run mode when stream is offline",
	},

	// サーバー設定
	"SERVER_PORT": {
		Key: "SERVER_PORT", Value: "8080", Type: SettingTypeNormal, Required: false,
		Description: "Web server port for OBS overlay",
	},

	// 音声認識設定（mic-recog）
	"MIC_RECOG_ENABLED": {
		Key: "MIC_RECOG_ENABLED", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable mic-recog transcription",
	},
	"MIC_RECOG_BACKEND": {
		Key: "MIC_RECOG_BACKEND", Value: "whisper", Type: SettingTypeNormal, Required: false,
		Description: "Mic-recog backend (whisper/whispercpp)",
	},
	"MIC_RECOG_DEVICE": {
		Key: "MIC_RECOG_DEVICE", Value: "auto", Type: SettingTypeNormal, Required: false,
		Description: "Whisper device (auto/cpu/mps/cuda)",
	},
	"MIC_RECOG_MIC_INDEX": {
		Key: "MIC_RECOG_MIC_INDEX", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Microphone device index (empty for default)",
	},
	"MIC_RECOG_MODEL": {
		Key: "MIC_RECOG_MODEL", Value: "large-v3", Type: SettingTypeNormal, Required: false,
		Description: "Whisper model size",
	},
	"MIC_RECOG_WHISPERCPP_BIN": {
		Key: "MIC_RECOG_WHISPERCPP_BIN", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Path to whisper.cpp binary",
	},
	"MIC_RECOG_WHISPERCPP_MODEL": {
		Key: "MIC_RECOG_WHISPERCPP_MODEL", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Path to whisper.cpp GGUF model",
	},
	"MIC_RECOG_WHISPERCPP_THREADS": {
		Key: "MIC_RECOG_WHISPERCPP_THREADS", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Whisper.cpp threads (empty = default)",
	},
	"MIC_RECOG_WHISPERCPP_EXTRA_ARGS": {
		Key: "MIC_RECOG_WHISPERCPP_EXTRA_ARGS", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Extra args for whisper.cpp",
	},
	"MIC_RECOG_LANGUAGE": {
		Key: "MIC_RECOG_LANGUAGE", Value: "ja", Type: SettingTypeNormal, Required: false,
		Description: "Whisper language code (empty for auto)",
	},
	"MIC_RECOG_VAD": {
		Key: "MIC_RECOG_VAD", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable VAD segmentation",
	},
	"MIC_RECOG_VAD_THRESHOLD": {
		Key: "MIC_RECOG_VAD_THRESHOLD", Value: "0.7", Type: SettingTypeNormal, Required: false,
		Description: "VAD speech probability threshold",
	},
	"MIC_RECOG_VAD_END_MS": {
		Key: "MIC_RECOG_VAD_END_MS", Value: "600", Type: SettingTypeNormal, Required: false,
		Description: "Silence duration (ms) to end a segment",
	},
	"MIC_RECOG_VAD_PRE_ROLL_MS": {
		Key: "MIC_RECOG_VAD_PRE_ROLL_MS", Value: "150", Type: SettingTypeNormal, Required: false,
		Description: "Audio kept before speech start (ms)",
	},
	"MIC_RECOG_NO_SPEECH_THRESHOLD": {
		Key: "MIC_RECOG_NO_SPEECH_THRESHOLD", Value: "0.85", Type: SettingTypeNormal, Required: false,
		Description: "Whisper no_speech_threshold",
	},
	"MIC_RECOG_LOGPROB_THRESHOLD": {
		Key: "MIC_RECOG_LOGPROB_THRESHOLD", Value: "-0.3", Type: SettingTypeNormal, Required: false,
		Description: "Whisper logprob_threshold",
	},
	"MIC_RECOG_EXCLUDE": {
		Key: "MIC_RECOG_EXCLUDE", Value: "ご視聴ありがとうございました", Type: SettingTypeNormal, Required: false,
		Description: "Exclude phrases (comma or newline separated)",
	},
	"MIC_RECOG_INTERIM": {
		Key: "MIC_RECOG_INTERIM", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable interim (real-time) transcription updates",
	},
	"MIC_RECOG_INTERIM_SECONDS": {
		Key: "MIC_RECOG_INTERIM_SECONDS", Value: "0.5", Type: SettingTypeNormal, Required: false,
		Description: "Interval between interim updates (seconds)",
	},
	"MIC_RECOG_INTERIM_WINDOW_SECONDS": {
		Key: "MIC_RECOG_INTERIM_WINDOW_SECONDS", Value: "3", Type: SettingTypeNormal, Required: false,
		Description: "Window size for interim transcription (seconds)",
	},
	"MIC_RECOG_INTERIM_MIN_SECONDS": {
		Key: "MIC_RECOG_INTERIM_MIN_SECONDS", Value: "1", Type: SettingTypeNormal, Required: false,
		Description: "Minimum audio length for interim transcription (seconds)",
	},

	// フォント設定
	"FONT_FILENAME": {
		Key: "FONT_FILENAME", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Uploaded font file name",
	},

	// ウィンドウ設定
	"WINDOW_X": {
		Key: "WINDOW_X", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Window X position",
	},
	"WINDOW_Y": {
		Key: "WINDOW_Y", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Window Y position",
	},
	"WINDOW_WIDTH": {
		Key: "WINDOW_WIDTH", Value: "1024", Type: SettingTypeNormal, Required: false,
		Description: "Window width",
	},
	"WINDOW_HEIGHT": {
		Key: "WINDOW_HEIGHT", Value: "768", Type: SettingTypeNormal, Required: false,
		Description: "Window height",
	},
	"WINDOW_FULLSCREEN": {
		Key: "WINDOW_FULLSCREEN", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Window fullscreen state",
	},
	"WINDOW_SCREEN_HASH": {
		Key: "WINDOW_SCREEN_HASH", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Screen configuration hash for window position validation",
	},
	"WINDOW_ABSOLUTE_X": {
		Key: "WINDOW_ABSOLUTE_X", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Window absolute X position",
	},
	"WINDOW_ABSOLUTE_Y": {
		Key: "WINDOW_ABSOLUTE_Y", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Window absolute Y position",
	},
	"WINDOW_SCREEN_INDEX": {
		Key: "WINDOW_SCREEN_INDEX", Value: "0", Type: SettingTypeNormal, Required: false,
		Description: "Screen index where window is located",
	},

	// オーバーレイ表示設定
	"MUSIC_ENABLED": {
		Key: "MUSIC_ENABLED", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable music player in overlay",
	},
	"MUSIC_VOLUME": {
		Key: "MUSIC_VOLUME", Value: "70", Type: SettingTypeNormal, Required: false,
		Description: "Music volume (0-100)",
	},
	"MUSIC_PLAYLIST": {
		Key: "MUSIC_PLAYLIST", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Selected music playlist",
	},
	"MUSIC_AUTO_PLAY": {
		Key: "MUSIC_AUTO_PLAY", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Auto play music on startup",
	},
	"FAX_ENABLED": {
		Key: "FAX_ENABLED", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable FAX animation in overlay",
	},
	"FAX_ANIMATION_SPEED": {
		Key: "FAX_ANIMATION_SPEED", Value: "1.0", Type: SettingTypeNormal, Required: false,
		Description: "FAX animation speed multiplier",
	},
	"FAX_IMAGE_TYPE": {
		Key: "FAX_IMAGE_TYPE", Value: "color", Type: SettingTypeNormal, Required: false,
		Description: "FAX image type (mono or color)",
	},
	"OVERLAY_CLOCK_ENABLED": {
		Key: "OVERLAY_CLOCK_ENABLED", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable clock display in overlay",
	},
	"OVERLAY_CLOCK_FORMAT": {
		Key: "OVERLAY_CLOCK_FORMAT", Value: "24h", Type: SettingTypeNormal, Required: false,
		Description: "Clock format (12h or 24h)",
	},
	"OVERLAY_LOCATION_ENABLED": {
		Key: "OVERLAY_LOCATION_ENABLED", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Show location in overlay",
	},
	"OVERLAY_DATE_ENABLED": {
		Key: "OVERLAY_DATE_ENABLED", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Show date in overlay",
	},
	"OVERLAY_TIME_ENABLED": {
		Key: "OVERLAY_TIME_ENABLED", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Show time in overlay",
	},
	"OVERLAY_DEBUG_ENABLED": {
		Key: "OVERLAY_DEBUG_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable debug panel in overlay",
	},
	"REWARD_COUNT_ENABLED": {
		Key: "REWARD_COUNT_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable reward count display in overlay",
	},
	"REWARD_COUNT_GROUP_ID": {
		Key: "REWARD_COUNT_GROUP_ID", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Reward group ID to display counts for (empty for all)",
	},
	"REWARD_COUNT_POSITION": {
		Key: "REWARD_COUNT_POSITION", Value: "left", Type: SettingTypeNormal, Required: false,
		Description: "Reward count display position (left or right)",
	},
	"OVERLAY_CARDS_EXPANDED": {
		Key: "OVERLAY_CARDS_EXPANDED", Value: `{"musicPlayer":true,"fax":true,"clock":true,"openaiUsage":true,"micTranscript":true,"rewardCount":true,"lottery":true}`, Type: SettingTypeNormal, Required: false,
		Description: "Collapsed/expanded state of overlay setting cards",
	},
	"OVERLAY_CARDS_LAYOUT": {
		Key: "OVERLAY_CARDS_LAYOUT", Value: `{"left":["musicPlayer","fax","clock","openaiUsage","micTranscript"],"right":["rewardCount","lottery"]}`, Type: SettingTypeNormal, Required: false,
		Description: "Layout (column + order) of overlay setting cards",
	},
	"MIC_TRANSCRIPT_ENABLED": {
		Key: "MIC_TRANSCRIPT_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable mic transcript overlay",
	},
	"MIC_TRANSCRIPT_POSITION": {
		Key: "MIC_TRANSCRIPT_POSITION", Value: "bottom-left", Type: SettingTypeNormal, Required: false,
		Description: "Mic transcript position (top-left/right/center, bottom-left/right/center)",
	},
	"MIC_TRANSCRIPT_FONT_SIZE": {
		Key: "MIC_TRANSCRIPT_FONT_SIZE", Value: "20", Type: SettingTypeNormal, Required: false,
		Description: "Mic transcript font size",
	},
	"MIC_TRANSCRIPT_MAX_LINES": {
		Key: "MIC_TRANSCRIPT_MAX_LINES", Value: "3", Type: SettingTypeNormal, Required: false,
		Description: "Mic transcript max lines",
	},
	"MIC_TRANSCRIPT_TRANSLATION_ENABLED": {
		Key: "MIC_TRANSCRIPT_TRANSLATION_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable translation for mic transcript overlay",
	},
	"MIC_TRANSCRIPT_TRANSLATION_MODE": {
		Key: "MIC_TRANSCRIPT_TRANSLATION_MODE", Value: "off", Type: SettingTypeNormal, Required: false,
		Description: "Mic transcript translation mode (off/openai/ollama)",
	},
	"MIC_TRANSCRIPT_TRANSLATION_LANGUAGE": {
		Key: "MIC_TRANSCRIPT_TRANSLATION_LANGUAGE", Value: "eng", Type: SettingTypeNormal, Required: false,
		Description: "Target language for mic transcript translation (e.g. jpn/eng)",
	},
	"MIC_TRANSCRIPT_TRANSLATION_FONT_SIZE": {
		Key: "MIC_TRANSCRIPT_TRANSLATION_FONT_SIZE", Value: "16", Type: SettingTypeNormal, Required: false,
		Description: "Font size for mic transcript translation",
	},
	"MIC_TRANSCRIPT_LINE_TTL_SECONDS": {
		Key: "MIC_TRANSCRIPT_LINE_TTL_SECONDS", Value: "8", Type: SettingTypeNormal, Required: false,
		Description: "Mic transcript line display duration (seconds)",
	},
	"MIC_TRANSCRIPT_LAST_TTL_SECONDS": {
		Key: "MIC_TRANSCRIPT_LAST_TTL_SECONDS", Value: "8", Type: SettingTypeNormal, Required: false,
		Description: "Mic transcript last line display duration (seconds, 0 = infinite)",
	},
	"OPENAI_USAGE_OVERLAY_ENABLED": {
		Key: "OPENAI_USAGE_OVERLAY_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Show OpenAI usage overlay under clock",
	},

	// プレゼントルーレット設定
	"LOTTERY_ENABLED": {
		Key: "LOTTERY_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable lottery/roulette feature in overlay",
	},
	"LOTTERY_REWARD_ID": {
		Key: "LOTTERY_REWARD_ID", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Target reward ID for lottery feature",
	},
	"LOTTERY_LOCKED": {
		Key: "LOTTERY_LOCKED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Whether the lottery is locked (reward disabled)",
	},
	"LOTTERY_DISPLAY_DURATION": {
		Key: "LOTTERY_DISPLAY_DURATION", Value: "5", Type: SettingTypeNormal, Required: false,
		Description: "Lottery display duration in seconds",
	},
	"LOTTERY_ANIMATION_SPEED": {
		Key: "LOTTERY_ANIMATION_SPEED", Value: "1.0", Type: SettingTypeNormal, Required: false,
		Description: "Lottery animation speed multiplier",
	},
	"LOTTERY_TICKER_ENABLED": {
		Key: "LOTTERY_TICKER_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable lottery participant ticker display in overlay",
	},
	"TICKER_NOTICE_ENABLED": {
		Key: "TICKER_NOTICE_ENABLED", Value: "false", Type: SettingTypeNormal, Required: false,
		Description: "Enable ticker notice display",
	},
	"TICKER_NOTICE_TEXT": {
		Key: "TICKER_NOTICE_TEXT", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Ticker notice text content",
	},
	"TICKER_NOTICE_FONT_SIZE": {
		Key: "TICKER_NOTICE_FONT_SIZE", Value: "16", Type: SettingTypeNormal, Required: false,
		Description: "Ticker notice font size in pixels",
	},
	"TICKER_NOTICE_ALIGN": {
		Key: "TICKER_NOTICE_ALIGN", Value: "center", Type: SettingTypeNormal, Required: false,
		Description: "Ticker notice text alignment (left/center/right)",
	},

	// 通知設定
	"NOTIFICATION_ENABLED": {
		Key: "NOTIFICATION_ENABLED", Value: "true", Type: SettingTypeNormal, Required: false,
		Description: "Enable chat notification window",
	},
	"NOTIFICATION_WINDOW_X": {
		Key: "NOTIFICATION_WINDOW_X", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Notification window X position",
	},
	"NOTIFICATION_WINDOW_Y": {
		Key: "NOTIFICATION_WINDOW_Y", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Notification window Y position",
	},
	"NOTIFICATION_WINDOW_WIDTH": {
		Key: "NOTIFICATION_WINDOW_WIDTH", Value: "400", Type: SettingTypeNormal, Required: false,
		Description: "Notification window width",
	},
	"NOTIFICATION_WINDOW_HEIGHT": {
		Key: "NOTIFICATION_WINDOW_HEIGHT", Value: "150", Type: SettingTypeNormal, Required: false,
		Description: "Notification window height",
	},
	"NOTIFICATION_WINDOW_ABSOLUTE_X": {
		Key: "NOTIFICATION_WINDOW_ABSOLUTE_X", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Notification window absolute X position",
	},
	"NOTIFICATION_WINDOW_ABSOLUTE_Y": {
		Key: "NOTIFICATION_WINDOW_ABSOLUTE_Y", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Notification window absolute Y position",
	},
	"NOTIFICATION_WINDOW_SCREEN_INDEX": {
		Key: "NOTIFICATION_WINDOW_SCREEN_INDEX", Value: "0", Type: SettingTypeNormal, Required: false,
		Description: "Notification window screen index",
	},
	"NOTIFICATION_WINDOW_SCREEN_HASH": {
		Key: "NOTIFICATION_WINDOW_SCREEN_HASH", Value: "", Type: SettingTypeNormal, Required: false,
		Description: "Screen configuration hash for notification window position validation",
	},
	"NOTIFICATION_DISPLAY_DURATION": {
		Key: "NOTIFICATION_DISPLAY_DURATION", Value: "5", Type: SettingTypeNormal, Required: false,
		Description: "Notification display duration in seconds",
	},
	"NOTIFICATION_DISPLAY_MODE": {
		Key: "NOTIFICATION_DISPLAY_MODE", Value: "queue", Type: SettingTypeNormal, Required: false,
		Description: "Notification display mode (queue/overwrite)",
	},
	"NOTIFICATION_FONT_SIZE": {
		Key: "NOTIFICATION_FONT_SIZE", Value: "14", Type: SettingTypeNormal, Required: false,
		Description: "Notification window font size in pixels",
	},
}

// 機能の有効性チェック
type FeatureStatus struct {
	TwitchConfigured  bool     `json:"twitch_configured"`
	PrinterConfigured bool     `json:"printer_configured"`
	PrinterConnected  bool     `json:"printer_connected"`
	MissingSettings   []string `json:"missing_settings"`
	Warnings          []string `json:"warnings"`
	ServiceMode       bool     `json:"service_mode"` // systemdサービスとして実行されているか
}

func (sm *SettingsManager) CheckFeatureStatus() (*FeatureStatus, error) {
	status := &FeatureStatus{
		MissingSettings: []string{},
		Warnings:        []string{},
		ServiceMode:     os.Getenv("RUNNING_AS_SERVICE") == "true",
	}

	// Twitch設定チェック
	twitchSettings := []string{"CLIENT_ID", "CLIENT_SECRET", "TWITCH_USER_ID", "TRIGGER_CUSTOM_REWORD_ID"}
	twitchComplete := true
	for _, key := range twitchSettings {
		if val, err := sm.GetSetting(key); err != nil || val == "" {
			status.MissingSettings = append(status.MissingSettings, key)
			twitchComplete = false
		}
	}
	status.TwitchConfigured = twitchComplete

	// プリンター設定チェック
	if printerAddr, err := sm.GetSetting("PRINTER_ADDRESS"); err != nil || printerAddr == "" {
		status.MissingSettings = append(status.MissingSettings, "PRINTER_ADDRESS")
		status.PrinterConfigured = false
	} else {
		status.PrinterConfigured = true
		// TODO: 実際の接続テストを実装
		status.PrinterConnected = false
	}

	// 警告チェック
	if dryRun, _ := sm.GetSetting("DRY_RUN_MODE"); dryRun == "true" {
		status.Warnings = append(status.Warnings, "DRY_RUN_MODE is enabled - no actual printing will occur")
	}

	return status, nil
}

// CRUD操作
func (sm *SettingsManager) GetSetting(key string) (string, error) {
	var value string
	err := sm.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		// デフォルト値を返す
		if defaultSetting, exists := DefaultSettings[key]; exists {
			return defaultSetting.Value, nil
		}
		return "", fmt.Errorf("setting not found: %s", key)
	}
	return value, err
}

func (sm *SettingsManager) SetSetting(key, value string) error {
	// デフォルト設定が存在するかチェック
	defaultSetting, exists := DefaultSettings[key]
	if !exists {
		return fmt.Errorf("unknown setting key: %s", key)
	}

	_, err := sm.db.Exec(`
		INSERT INTO settings (key, value, setting_type, is_required, description) 
		VALUES (?, ?, ?, ?, ?) 
		ON CONFLICT(key) DO UPDATE SET 
			value = excluded.value, 
			updated_at = CURRENT_TIMESTAMP`,
		key, value,
		string(defaultSetting.Type),
		defaultSetting.Required,
		defaultSetting.Description,
	)
	return err
}

func (sm *SettingsManager) GetAllSettings() (map[string]Setting, error) {
	rows, err := sm.db.Query(`
		SELECT key, value, setting_type, is_required, description, updated_at 
		FROM settings ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]Setting)
	for rows.Next() {
		var s Setting
		var settingType string
		var description sql.NullString
		err := rows.Scan(&s.Key, &s.Value, &settingType, &s.Required, &description, &s.UpdatedAt)
		if err != nil {
			return nil, err
		}
		s.Type = SettingType(settingType)
		s.Description = description.String // NullStringから通常のstringへ変換

		// 機密情報も実際の値を返す（フロントエンドでマスク処理）
		s.HasValue = s.Value != ""

		settings[s.Key] = s
	}

	// DBにない設定はデフォルト値で補完
	for key, defaultSetting := range DefaultSettings {
		if _, exists := settings[key]; !exists {
			settings[key] = defaultSetting
		}
	}

	return settings, nil
}

// 実際の値を取得（マスクなし）- 内部処理用
func (sm *SettingsManager) GetRealValue(key string) (string, error) {
	var value string
	err := sm.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		// デフォルト値を返す
		if defaultSetting, exists := DefaultSettings[key]; exists {
			return defaultSetting.Value, nil
		}
		return "", fmt.Errorf("setting not found: %s", key)
	}
	return value, err
}

// 環境変数からの移行
func (sm *SettingsManager) MigrateFromEnv() error {
	logger.Info("Starting migration from environment variables")
	migrated := 0

	for key := range DefaultSettings {
		// 既にDB設定が存在する場合はスキップ
		var existingKey string
		if err := sm.db.QueryRow("SELECT key FROM settings WHERE key = ?", key).Scan(&existingKey); err == nil {
			continue
		}

		// 環境変数から取得
		if envValue := os.Getenv(key); envValue != "" {
			if err := sm.SetSetting(key, envValue); err != nil {
				logger.Error("Failed to migrate setting", zap.String("key", key), zap.Error(err))
				return fmt.Errorf("failed to migrate %s: %w", key, err)
			}
			logger.Info("Migrated setting from environment", zap.String("key", key))
			migrated++
		}
	}

	if migrated > 0 {
		logger.Info("Migration completed", zap.Int("migrated_count", migrated))

		// セキュリティ警告を表示
		if hasSecretInEnv() {
			logger.Warn("SECURITY WARNING: Sensitive data found in environment variables.")
			logger.Warn("Please remove CLIENT_SECRET and other sensitive values from .env file after confirming the migration is successful.")
		}
	}

	return nil
}

func hasSecretInEnv() bool {
	secretKeys := []string{"CLIENT_SECRET", "CLIENT_ID", "TWITCH_USER_ID", "TRIGGER_CUSTOM_REWORD_ID", "OPENAI_API_KEY"}
	for _, key := range secretKeys {
		if os.Getenv(key) != "" {
			return true
		}
	}
	return false
}

// バリデーション
func ValidateSetting(key, value string) error {
	switch key {
	case "PRINTER_TYPE":
		if value != "bluetooth" && value != "usb" {
			return fmt.Errorf("must be 'bluetooth' or 'usb'")
		}
	case "USB_PRINTER_NAME":
		// 空文字列はOK（未設定）
		if value != "" {
			if len(value) == 0 || len(value) > 255 {
				return fmt.Errorf("printer name length must be between 1 and 255 characters")
			}
		}
	case "BLACK_POINT":
		if val, err := strconv.ParseFloat(value, 32); err != nil || val < 0.0 || val > 1.0 {
			return fmt.Errorf("must be float between 0.0 and 1.0")
		}
	case "KEEP_ALIVE_INTERVAL":
		if val, err := strconv.Atoi(value); err != nil || val < 10 || val > 3600 {
			return fmt.Errorf("must be integer between 10 and 3600 seconds")
		}
	case "PRINTER_ADDRESS":
		// MACアドレスまたはmacOS UUID形式のチェック
		if value != "" {
			// 標準的なMACアドレス形式 (AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF)
			macMatched, _ := regexp.MatchString(`^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$`, value)

			// macOS Core Bluetooth UUID形式 (32文字の16進数、ハイフンなし)
			uuidMatched, _ := regexp.MatchString(`^[0-9A-Fa-f]{32}$`, value)

			// macOS UUID形式（ハイフンあり: 8-4-4-4-12）
			uuidWithHyphenMatched, _ := regexp.MatchString(`^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$`, value)

			if !macMatched && !uuidMatched && !uuidWithHyphenMatched {
				return fmt.Errorf("invalid address format (expected MAC address or UUID)")
			}
		}
	case "TIMEZONE":
		// 基本的なタイムゾーンのバリデーション
		if value != "" {
			if _, err := time.LoadLocation(value); err != nil {
				return fmt.Errorf("invalid timezone: %v", err)
			}
		}
	case "NOTIFICATION_DISPLAY_DURATION":
		// 表示秒数のチェック（1〜60秒）
		if val, err := strconv.Atoi(value); err != nil || val < 1 || val > 60 {
			return fmt.Errorf("must be integer between 1 and 60 seconds")
		}
	case "REWARD_COUNT_POSITION":
		// 位置のチェック（left or right）
		if value != "left" && value != "right" {
			return fmt.Errorf("must be 'left' or 'right'")
		}
	case "LOTTERY_DISPLAY_DURATION":
		// 表示秒数のチェック（3〜15秒）
		if val, err := strconv.Atoi(value); err != nil || val < 3 || val > 15 {
			return fmt.Errorf("must be integer between 3 and 15 seconds")
		}
	case "LOTTERY_ANIMATION_SPEED":
		// アニメーション速度のチェック（0.5〜2.0）
		if val, err := strconv.ParseFloat(value, 64); err != nil || val < 0.5 || val > 2.0 {
			return fmt.Errorf("must be float between 0.5 and 2.0")
		}
	case "TRANSLATION_BACKEND":
		if value != "openai" && value != "ollama" {
			return fmt.Errorf("must be 'openai' or 'ollama'")
		}
	case "MIC_TRANSCRIPT_TRANSLATION_MODE":
		if value != "off" && value != "openai" && value != "ollama" {
			return fmt.Errorf("must be 'off', 'openai', or 'ollama'")
		}
	case "OLLAMA_NUM_PREDICT":
		if value != "" {
			if val, err := strconv.Atoi(value); err != nil || val < 1 || val > 4096 {
				return fmt.Errorf("must be integer between 1 and 4096")
			}
		}
	case "OLLAMA_TEMPERATURE":
		if value != "" {
			if val, err := strconv.ParseFloat(value, 64); err != nil || val < 0 || val > 2.0 {
				return fmt.Errorf("must be float between 0.0 and 2.0")
			}
		}
	case "OLLAMA_TOP_P":
		if value != "" {
			if val, err := strconv.ParseFloat(value, 64); err != nil || val < 0 || val > 1.0 {
				return fmt.Errorf("must be float between 0.0 and 1.0")
			}
		}
	case "OLLAMA_NUM_CTX":
		if value != "" {
			if val, err := strconv.Atoi(value); err != nil || val < 128 || val > 131072 {
				return fmt.Errorf("must be integer between 128 and 131072")
			}
		}
	case "OLLAMA_CUSTOM_MODEL_NAME":
		if value != "" {
			matched, _ := regexp.MatchString(`^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$`, value)
			if !matched {
				return fmt.Errorf("must be 1-128 chars (alnum, . _ : -)")
			}
		}
	case "TICKER_NOTICE_FONT_SIZE":
		if val, err := strconv.Atoi(value); err != nil || val < 10 || val > 48 {
			return fmt.Errorf("font size must be between 10 and 48 pixels")
		}
	case "TICKER_NOTICE_ALIGN":
		if value != "left" && value != "center" && value != "right" {
			return fmt.Errorf("alignment must be left, center, or right")
		}
	case "NOTIFICATION_DISPLAY_MODE":
		if value != "queue" && value != "overwrite" {
			return fmt.Errorf("must be 'queue' or 'overwrite'")
		}
	case "MIC_TRANSCRIPT_LINE_TTL_SECONDS":
		if val, err := strconv.Atoi(value); err != nil || val < 1 || val > 300 {
			return fmt.Errorf("must be integer between 1 and 300 seconds")
		}
	case "MIC_TRANSCRIPT_LAST_TTL_SECONDS":
		if val, err := strconv.Atoi(value); err != nil || val < 0 || val > 300 {
			return fmt.Errorf("must be integer between 0 and 300 seconds")
		}
	case "DRY_RUN_MODE", "BEST_QUALITY", "DITHER", "AUTO_ROTATE", "ROTATE_PRINT", "KEEP_ALIVE_ENABLED", "CLOCK_ENABLED", "CLOCK_SHOW_ICONS", "DEBUG_OUTPUT", "NOTIFICATION_ENABLED", "CHAT_TRANSLATION_ENABLED", "REWARD_COUNT_ENABLED", "LOTTERY_ENABLED", "LOTTERY_TICKER_ENABLED", "TICKER_NOTICE_ENABLED", "MUSIC_ENABLED", "MUSIC_AUTO_PLAY", "FAX_ENABLED", "OVERLAY_CLOCK_ENABLED", "OVERLAY_LOCATION_ENABLED", "OVERLAY_DATE_ENABLED", "OVERLAY_TIME_ENABLED", "OVERLAY_DEBUG_ENABLED":
		// boolean値のチェック
		if value != "true" && value != "false" {
			return fmt.Errorf("must be 'true' or 'false'")
		}
	}
	return nil
}

// 初期設定のセットアップ
func (sm *SettingsManager) InitializeDefaultSettings() error {
	for key, setting := range DefaultSettings {
		// 既に設定が存在する場合はスキップ
		var existingKey string
		if err := sm.db.QueryRow("SELECT key FROM settings WHERE key = ?", key).Scan(&existingKey); err == nil {
			continue
		}

		// デフォルト値で初期化
		if err := sm.SetSetting(key, setting.Value); err != nil {
			return fmt.Errorf("failed to initialize setting %s: %w", key, err)
		}
	}
	return nil
}
