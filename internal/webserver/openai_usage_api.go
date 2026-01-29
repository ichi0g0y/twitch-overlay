package webserver

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
)

type openAIUsageResponse struct {
	Timezone string               `json:"timezone"`
	Daily    openAIUsageAggregate `json:"daily"`
	Total    openAIUsageAggregate `json:"total"`
}

type openAIUsageAggregate struct {
	Date        string  `json:"date"`
	InputTokens int     `json:"input_tokens"`
	OutputTokens int    `json:"output_tokens"`
	TotalTokens int     `json:"total_tokens"`
	CostUSD     float64 `json:"cost_usd"`
}

func handleOpenAIUsage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	manager := settings.NewSettingsManager(localdb.GetDB())

	timezone := readSettingString(manager, "TIMEZONE")
	if timezone == "" {
		timezone = "UTC"
	}

	dailyInput := readSettingInt(manager, "OPENAI_USAGE_DAILY_INPUT_TOKENS")
	dailyOutput := readSettingInt(manager, "OPENAI_USAGE_DAILY_OUTPUT_TOKENS")
	dailyCost := readSettingFloat(manager, "OPENAI_USAGE_DAILY_COST_USD")
	dailyDate := readSettingString(manager, "OPENAI_USAGE_DAILY_DATE")
	if dailyDate == "" {
		dailyDate = todayString(timezone)
	}

	totalInput := readSettingInt(manager, "OPENAI_USAGE_INPUT_TOKENS")
	totalOutput := readSettingInt(manager, "OPENAI_USAGE_OUTPUT_TOKENS")
	totalCost := readSettingFloat(manager, "OPENAI_USAGE_COST_USD")

	resp := openAIUsageResponse{
		Timezone: timezone,
		Daily: openAIUsageAggregate{
			Date:         dailyDate,
			InputTokens:  dailyInput,
			OutputTokens: dailyOutput,
			TotalTokens:  dailyInput + dailyOutput,
			CostUSD:      dailyCost,
		},
		Total: openAIUsageAggregate{
			Date:         "",
			InputTokens:  totalInput,
			OutputTokens: totalOutput,
			TotalTokens:  totalInput + totalOutput,
			CostUSD:      totalCost,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func handleOpenAIUsageReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	manager := settings.NewSettingsManager(localdb.GetDB())
	timezone := readSettingString(manager, "TIMEZONE")
	if timezone == "" {
		timezone = "UTC"
	}

	today := todayString(timezone)
	_ = manager.SetSetting("OPENAI_USAGE_DAILY_DATE", today)
	_ = manager.SetSetting("OPENAI_USAGE_DAILY_INPUT_TOKENS", "0")
	_ = manager.SetSetting("OPENAI_USAGE_DAILY_OUTPUT_TOKENS", "0")
	_ = manager.SetSetting("OPENAI_USAGE_DAILY_COST_USD", "0")

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":   true,
		"date": today,
	})
}

func todayString(timezone string) string {
	loc := time.Local
	if timezone != "" {
		if loaded, err := time.LoadLocation(timezone); err == nil {
			loc = loaded
		}
	}
	return time.Now().In(loc).Format("2006-01-02")
}

func readSettingString(manager *settings.SettingsManager, key string) string {
	value, err := manager.GetRealValue(key)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(value)
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
