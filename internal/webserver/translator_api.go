package webserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/translation"
	"go.uber.org/zap"
)

type translationTestRequest struct {
	Text      string `json:"text"`
	SrcLang   string `json:"src_lang"`
	TgtLang   string `json:"tgt_lang"`
	Backend   string `json:"backend"`
	MaxTokens *int   `json:"max_new_tokens"`
}

type translationTestResponse struct {
	Text       string `json:"text"`
	Backend    string `json:"backend"`
	SourceLang string `json:"source_lang"`
	TargetLang string `json:"target_lang"`
	TookMS     int    `json:"took_ms"`
}

func handleTranslationTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req translationTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		http.Error(w, "text is required", http.StatusBadRequest)
		return
	}

	backend := strings.TrimSpace(strings.ToLower(req.Backend))
	if backend == "" {
		backend = translation.DefaultTranslationBackend
	}
	if backend == "off" {
		response := translationTestResponse{
			Text:    "",
			Backend: "off",
		}
		writeJSON(w, response)
		return
	}
	backend = translation.ResolveTranslationBackend(backend)

	srcLang := strings.TrimSpace(req.SrcLang)
	tgtLang := strings.TrimSpace(req.TgtLang)
	start := time.Now()

	var translated string
	var detectedLang string
	var err error

	switch backend {
	case translation.BackendOllama:
		if srcLang == "" {
			normalized := translation.NormalizeForLanguageDetection(text)
			srcLang = translation.DetectLanguageCode(normalized)
		}
		if tgtLang == "" {
			tgtLang = getSettingValueFromDB("MIC_TRANSCRIPT_TRANSLATION_LANGUAGE")
			if tgtLang == "" {
				tgtLang = "eng"
			}
		}
		baseURL := translation.ResolveOllamaBaseURL(getSettingValueFromDB("OLLAMA_BASE_URL"))
		model := getSettingValueFromDB("OLLAMA_MODEL")
		numPredict := req.MaxTokens
		if numPredict == nil {
			numPredict = translation.ParseOllamaNumPredict(getSettingValueFromDB("OLLAMA_NUM_PREDICT"))
		}
		opts := translation.OllamaRequestOptions{
			NumPredict:   numPredict,
			Temperature:  translation.ParseOllamaTemperature(getSettingValueFromDB("OLLAMA_TEMPERATURE")),
			TopP:         translation.ParseOllamaTopP(getSettingValueFromDB("OLLAMA_TOP_P")),
			NumCtx:       translation.ParseOllamaNumCtx(getSettingValueFromDB("OLLAMA_NUM_CTX")),
			Stop:         translation.ParseOllamaStop(getSettingValueFromDB("OLLAMA_STOP")),
			SystemPrompt: getSettingValueFromDB("OLLAMA_SYSTEM_PROMPT"),
		}
		translated, detectedLang, err = translation.TranslateToTargetLanguageOllama(baseURL, model, text, srcLang, tgtLang, opts)
	case translation.BackendOpenAI:
		apiKey := getSettingValueFromDB("OPENAI_API_KEY")
		if strings.TrimSpace(apiKey) == "" {
			http.Error(w, "OpenAI API key is not set", http.StatusBadRequest)
			return
		}
		modelName := getSettingValueFromDB("OPENAI_MODEL")
		if tgtLang == "" {
			tgtLang = "eng"
		}
		openAITarget := translation.NormalizeFromLangTag(tgtLang)
		if openAITarget == "" {
			openAITarget = tgtLang
		}
		translated, detectedLang, err = translation.TranslateToTargetLanguage(apiKey, text, modelName, openAITarget)
		tgtLang = openAITarget
	default:
		http.Error(w, "invalid backend", http.StatusBadRequest)
		return
	}

	if err != nil {
		logger.Warn("Translation test failed", zap.Error(err))
		http.Error(w, fmt.Sprintf("translation failed: %v", err), http.StatusBadGateway)
		return
	}

	response := translationTestResponse{
		Text:       translated,
		Backend:    backend,
		SourceLang: detectedLang,
		TargetLang: tgtLang,
		TookMS:     int(time.Since(start).Milliseconds()),
	}
	writeJSON(w, response)
}

func getSettingValueFromDB(key string) string {
	db := localdb.GetDB()
	if db == nil {
		return ""
	}
	manager := settings.NewSettingsManager(db)
	value, err := manager.GetRealValue(key)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func writeJSON(w http.ResponseWriter, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	_ = enc.Encode(payload)
}
