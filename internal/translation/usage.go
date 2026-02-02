package translation

import (
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
)

type modelPricing struct {
	InputPerMillion  float64
	OutputPerMillion float64
}

var usageMutex sync.Mutex

var modelPricingTable = map[string]modelPricing{
	"gpt-5.2":      {InputPerMillion: 1.75, OutputPerMillion: 14.00},
	"gpt-5.1":      {InputPerMillion: 1.25, OutputPerMillion: 10.00},
	"gpt-5":        {InputPerMillion: 1.25, OutputPerMillion: 10.00},
	"gpt-5-mini":   {InputPerMillion: 0.25, OutputPerMillion: 2.00},
	"gpt-5-nano":   {InputPerMillion: 0.05, OutputPerMillion: 0.40},
	"gpt-4o":       {InputPerMillion: 2.50, OutputPerMillion: 10.00},
	"gpt-4o-mini":  {InputPerMillion: 0.15, OutputPerMillion: 0.60},
	"gpt-4.1":      {InputPerMillion: 2.00, OutputPerMillion: 8.00},
	"gpt-4.1-mini": {InputPerMillion: 0.40, OutputPerMillion: 1.60},
	"gpt-4.1-nano": {InputPerMillion: 0.10, OutputPerMillion: 0.40},
}

func AddOpenAIUsage(model string, inputTokens, outputTokens int) (float64, bool, error) {
	if inputTokens <= 0 && outputTokens <= 0 {
		return 0, false, nil
	}

	usageMutex.Lock()
	defer usageMutex.Unlock()

	db := localdb.GetDB()
	if db == nil {
		return 0, false, nil
	}

	manager := settings.NewSettingsManager(db)

	resetDailyIfNeeded(manager)

	currentInput := readSettingInt(manager, "OPENAI_USAGE_INPUT_TOKENS")
	currentOutput := readSettingInt(manager, "OPENAI_USAGE_OUTPUT_TOKENS")
	currentCost := readSettingFloat(manager, "OPENAI_USAGE_COST_USD")

	dailyInput := readSettingInt(manager, "OPENAI_USAGE_DAILY_INPUT_TOKENS")
	dailyOutput := readSettingInt(manager, "OPENAI_USAGE_DAILY_OUTPUT_TOKENS")
	dailyCost := readSettingFloat(manager, "OPENAI_USAGE_DAILY_COST_USD")

	newInput := currentInput + maxInt(inputTokens, 0)
	newOutput := currentOutput + maxInt(outputTokens, 0)
	newDailyInput := dailyInput + maxInt(inputTokens, 0)
	newDailyOutput := dailyOutput + maxInt(outputTokens, 0)

	addedCost, ok := estimateCostUSD(model, inputTokens, outputTokens)
	newCost := currentCost
	newDailyCost := dailyCost
	if ok {
		newCost += addedCost
		newDailyCost += addedCost
	}

	_ = manager.SetSetting("OPENAI_USAGE_INPUT_TOKENS", strconv.Itoa(newInput))
	_ = manager.SetSetting("OPENAI_USAGE_OUTPUT_TOKENS", strconv.Itoa(newOutput))
	if ok {
		_ = manager.SetSetting("OPENAI_USAGE_COST_USD", formatFloat(newCost))
	}
	_ = manager.SetSetting("OPENAI_USAGE_DAILY_INPUT_TOKENS", strconv.Itoa(newDailyInput))
	_ = manager.SetSetting("OPENAI_USAGE_DAILY_OUTPUT_TOKENS", strconv.Itoa(newDailyOutput))
	if ok {
		_ = manager.SetSetting("OPENAI_USAGE_DAILY_COST_USD", formatFloat(newDailyCost))
	}

	return addedCost, ok, nil
}

func resetDailyIfNeeded(manager *settings.SettingsManager) {
	tz := readSettingString(manager, "TIMEZONE")
	loc := time.Local
	if tz != "" {
		if loaded, err := time.LoadLocation(tz); err == nil {
			loc = loaded
		}
	}

	today := time.Now().In(loc).Format("2006-01-02")
	storedDate := readSettingString(manager, "OPENAI_USAGE_DAILY_DATE")
	if storedDate == today {
		return
	}

	_ = manager.SetSetting("OPENAI_USAGE_DAILY_DATE", today)
	_ = manager.SetSetting("OPENAI_USAGE_DAILY_INPUT_TOKENS", "0")
	_ = manager.SetSetting("OPENAI_USAGE_DAILY_OUTPUT_TOKENS", "0")
	_ = manager.SetSetting("OPENAI_USAGE_DAILY_COST_USD", "0")
}

func estimateCostUSD(model string, inputTokens, outputTokens int) (float64, bool) {
	if inputTokens <= 0 && outputTokens <= 0 {
		return 0, false
	}
	normalized := normalizeModelName(model)
	pricing, ok := modelPricingTable[normalized]
	if !ok {
		return 0, false
	}
	cost := (float64(inputTokens)/1_000_000.0)*pricing.InputPerMillion +
		(float64(outputTokens)/1_000_000.0)*pricing.OutputPerMillion
	return cost, true
}

func normalizeModelName(model string) string {
	model = strings.ToLower(strings.TrimSpace(model))
	for key := range modelPricingTable {
		if model == key {
			return key
		}
		if strings.HasPrefix(model, key+"-") {
			return key
		}
	}
	return model
}

func readSettingInt(manager *settings.SettingsManager, key string) int {
	value, err := manager.GetRealValue(key)
	if err != nil {
		return 0
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return parsed
}

func readSettingFloat(manager *settings.SettingsManager, key string) float64 {
	value, err := manager.GetRealValue(key)
	if err != nil {
		return 0
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func readSettingString(manager *settings.SettingsManager, key string) string {
	value, err := manager.GetRealValue(key)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', 6, 64)
}

func maxInt(value, fallback int) int {
	if value < fallback {
		return fallback
	}
	return value
}
