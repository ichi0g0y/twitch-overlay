package translation

import (
	"strconv"
	"strings"
	"sync"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
)

type modelPricing struct {
	InputPerMillion  float64
	OutputPerMillion float64
}

var usageMutex sync.Mutex

var modelPricingTable = map[string]modelPricing{
	"gpt-4o-mini":  {InputPerMillion: 0.15, OutputPerMillion: 0.60},
	"gpt-4o":       {InputPerMillion: 2.50, OutputPerMillion: 10.00},
	"gpt-4.1-mini": {InputPerMillion: 0.40, OutputPerMillion: 1.60},
	"gpt-4.1":      {InputPerMillion: 2.00, OutputPerMillion: 8.00},
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

	currentInput := readSettingInt(manager, "OPENAI_USAGE_INPUT_TOKENS")
	currentOutput := readSettingInt(manager, "OPENAI_USAGE_OUTPUT_TOKENS")
	currentCost := readSettingFloat(manager, "OPENAI_USAGE_COST_USD")

	newInput := currentInput + maxInt(inputTokens, 0)
	newOutput := currentOutput + maxInt(outputTokens, 0)

	addedCost, ok := estimateCostUSD(model, inputTokens, outputTokens)
	newCost := currentCost
	if ok {
		newCost += addedCost
	}

	_ = manager.SetSetting("OPENAI_USAGE_INPUT_TOKENS", strconv.Itoa(newInput))
	_ = manager.SetSetting("OPENAI_USAGE_OUTPUT_TOKENS", strconv.Itoa(newOutput))
	if ok {
		_ = manager.SetSetting("OPENAI_USAGE_COST_USD", formatFloat(newCost))
	}

	return addedCost, ok, nil
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

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', 6, 64)
}

func maxInt(value, fallback int) int {
	if value < fallback {
		return fallback
	}
	return value
}
