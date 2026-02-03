package webserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/translation"
	"go.uber.org/zap"
)

type chatTestRequest struct {
	Text string `json:"text"`
}

type chatTestResponse struct {
	Text   string `json:"text"`
	TookMS int    `json:"took_ms"`
}

func buildChatSystemPrompt() string {
	base := strings.TrimSpace(getSettingValueFromDB("OLLAMA_CHAT_SYSTEM_PROMPT"))
	timezone := strings.TrimSpace(getSettingValueFromDB("TIMEZONE"))

	loc := time.Local
	if timezone != "" {
		if loaded, err := time.LoadLocation(timezone); err == nil {
			loc = loaded
		}
	}
	now := time.Now().In(loc)
	weekdayJP := []string{"日", "月", "火", "水", "木", "金", "土"}[now.Weekday()]
	dateLine := fmt.Sprintf("現在日時: %s (%s) %s", now.Format("2006-01-02 15:04:05"), weekdayJP, now.Format("MST"))
	if timezone != "" {
		dateLine = fmt.Sprintf("%s [%s]", dateLine, timezone)
	}

	if base == "" {
		return dateLine
	}
	return base + "\n\n" + dateLine
}

func handleChatTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req chatTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	prompt := strings.TrimSpace(req.Text)
	if prompt == "" {
		http.Error(w, "text is required", http.StatusBadRequest)
		return
	}

	baseURL := translation.ResolveOllamaBaseURL(getSettingValueFromDB("OLLAMA_BASE_URL"))
	model := strings.TrimSpace(getSettingValueFromDB("OLLAMA_CHAT_MODEL"))
	if model == "" {
		http.Error(w, "ollama chat model is not set", http.StatusBadRequest)
		return
	}

	opts := translation.OllamaRequestOptions{
		NumPredict:   translation.ParseOllamaNumPredict(getSettingValueFromDB("OLLAMA_CHAT_NUM_PREDICT")),
		Temperature:  translation.ParseOllamaTemperature(getSettingValueFromDB("OLLAMA_CHAT_TEMPERATURE")),
		TopP:         translation.ParseOllamaTopP(getSettingValueFromDB("OLLAMA_CHAT_TOP_P")),
		NumCtx:       translation.ParseOllamaNumCtx(getSettingValueFromDB("OLLAMA_CHAT_NUM_CTX")),
		Stop:         translation.ParseOllamaStop(getSettingValueFromDB("OLLAMA_CHAT_STOP")),
		SystemPrompt: buildChatSystemPrompt(),
	}

	start := time.Now()
	responseText, err := translation.ChatWithOllama(baseURL, model, prompt, opts)
	if err != nil {
		logger.Warn("Chat test failed", zap.Error(err))
		http.Error(w, fmt.Sprintf("chat failed: %v", err), http.StatusBadGateway)
		return
	}

	response := chatTestResponse{
		Text:   responseText,
		TookMS: int(time.Since(start).Milliseconds()),
	}
	writeJSON(w, response)
}
