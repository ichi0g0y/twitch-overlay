package translation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type ollamaGenerateRequest struct {
	Model   string                 `json:"model"`
	Prompt  string                 `json:"prompt"`
	System  string                 `json:"system,omitempty"`
	Stream  bool                   `json:"stream"`
	Options map[string]interface{} `json:"options,omitempty"`
}

type ollamaGenerateResponse struct {
	Response string `json:"response"`
	Thinking string `json:"thinking"`
	Done     bool   `json:"done"`
	Error    string `json:"error"`
}

type ollamaChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ollamaChatRequest struct {
	Model    string                 `json:"model"`
	Messages []ollamaChatMessage    `json:"messages"`
	Stream   bool                   `json:"stream"`
	Options  map[string]interface{} `json:"options,omitempty"`
}

type ollamaChatResponse struct {
	Message struct {
		Content  string `json:"content"`
		Thinking string `json:"thinking"`
	} `json:"message"`
	Done  bool   `json:"done"`
	Error string `json:"error"`
}

type OllamaRequestOptions struct {
	NumPredict   *int
	Temperature  *float64
	TopP         *float64
	NumCtx       *int
	Stop         []string
	SystemPrompt string
}

var langTagToName = map[string]string{
	"jpn_jpan": "Japanese",
	"eng_latn": "English",
	"kor_hang": "Korean",
	"zho_hans": "Chinese (Simplified)",
	"zho_hant": "Chinese (Traditional)",
	"spa_latn": "Spanish",
	"fra_latn": "French",
	"deu_latn": "German",
	"ita_latn": "Italian",
	"por_latn": "Portuguese",
	"rus_cyrl": "Russian",
	"ara_arab": "Arabic",
	"hin_deva": "Hindi",
	"tha_thai": "Thai",
	"vie_latn": "Vietnamese",
	"ind_latn": "Indonesian",
	"fil_latn": "Filipino",
}

var iso6393ToName = map[string]string{
	"jpn": "Japanese",
	"eng": "English",
	"kor": "Korean",
	"cmn": "Chinese",
	"zho": "Chinese",
	"spa": "Spanish",
	"fra": "French",
	"deu": "German",
	"ita": "Italian",
	"por": "Portuguese",
	"rus": "Russian",
	"ara": "Arabic",
	"hin": "Hindi",
	"tha": "Thai",
	"vie": "Vietnamese",
	"ind": "Indonesian",
	"fil": "Filipino",
	"ben": "Bengali",
	"nld": "Dutch",
	"swe": "Swedish",
	"nor": "Norwegian",
	"dan": "Danish",
	"fin": "Finnish",
	"pol": "Polish",
	"tur": "Turkish",
	"ukr": "Ukrainian",
	"ell": "Greek",
	"heb": "Hebrew",
	"hun": "Hungarian",
	"ces": "Czech",
	"slk": "Slovak",
	"ron": "Romanian",
	"bul": "Bulgarian",
	"srp": "Serbian",
	"hrv": "Croatian",
	"slv": "Slovenian",
	"est": "Estonian",
	"lav": "Latvian",
	"lit": "Lithuanian",
	"fas": "Persian",
	"urd": "Urdu",
	"tam": "Tamil",
}

func ResolveOllamaBaseURL(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return DefaultOllamaBaseURL
	}
	normalized := strings.TrimRight(trimmed, "/")
	if parsed, err := url.Parse(normalized); err == nil && parsed.Scheme != "" && parsed.Host != "" {
		path := strings.TrimRight(parsed.Path, "/")
		if path != "" {
			segments := strings.Split(path, "/")
			last := segments[len(segments)-1]
			switch last {
			case "api", "generate", "pull", "tags", "version", "show", "embeddings", "chat":
				segments = segments[:len(segments)-1]
				parsed.Path = strings.Join(segments, "/")
				if parsed.Path == "" {
					parsed.Path = "/"
				}
			}
		}
		parsed.RawQuery = ""
		parsed.Fragment = ""
		return strings.TrimRight(parsed.String(), "/")
	}

	for _, suffix := range []string{`/api/generate`, `/api/pull`, `/api/tags`, `/api/version`, `/api/show`, `/api/embeddings`, `/api/chat`, `/api`} {
		if strings.HasSuffix(normalized, suffix) {
			return strings.TrimRight(strings.TrimSuffix(normalized, suffix), "/")
		}
	}
	return normalized
}

func TranslateToTargetLanguageOllama(baseURL, model, text, srcLang, tgtLang string, opts OllamaRequestOptions) (string, string, error) {
	if strings.TrimSpace(text) == "" {
		return "", "", nil
	}

	baseURL = ResolveOllamaBaseURL(baseURL)
	if baseURL == "" {
		baseURL = DefaultOllamaBaseURL
	}

	model = strings.TrimSpace(model)
	if model == "" {
		return "", "", fmt.Errorf("ollama model is not set")
	}

	srcLang = strings.TrimSpace(srcLang)
	tgtLang = strings.TrimSpace(tgtLang)

	var sourceLangCode string
	var sourceLangName string
	sourceExplicit := srcLang != ""
	if sourceExplicit {
		sourceLangCode = normalizeOllamaLangCode(srcLang)
		sourceLangName = languageNameFromInput(srcLang)
	}
	if sourceLangCode == "" {
		normalized := NormalizeForLanguageDetection(text)
		sourceLangCode = DetectLanguageCode(normalized)
	}
	if sourceLangCode == "" {
		sourceLangCode = "und"
	}

	targetLangName := languageNameFromInput(tgtLang)
	if targetLangName == "" {
		targetLangName = "English"
	}

	prompt := buildOllamaPrompt(text, targetLangName, sourceLangName, sourceExplicit)
	if strings.TrimSpace(opts.SystemPrompt) != "" && isHfModelID(model) {
		prompt = strings.TrimSpace(opts.SystemPrompt) + "\n\n" + prompt
	}

	temperature := 0.1
	if opts.Temperature != nil {
		temperature = *opts.Temperature
	}
	topP := 0.9
	if opts.TopP != nil {
		topP = *opts.TopP
	}
	options := map[string]interface{}{
		"temperature": temperature,
		"top_p":       topP,
	}
	if normalized := normalizeNumPredict(opts.NumPredict); normalized != nil {
		options["num_predict"] = *normalized
	}
	if opts.NumCtx != nil && *opts.NumCtx > 0 {
		options["num_ctx"] = *opts.NumCtx
	}
	if len(opts.Stop) > 0 {
		options["stop"] = opts.Stop
	}

	systemPrompt := resolveOllamaSystemPrompt(model, opts.SystemPrompt)

	responseText, err := translateWithOllamaGenerate(baseURL, model, prompt, systemPrompt, options)
	if err != nil {
		return "", "", err
	}

	translated := cleanupOllamaTranslation(responseText)
	if translated == "" {
		fallbackPrompt := buildOllamaFallbackPrompt(text, targetLangName, sourceLangName, sourceExplicit)
		fallbackTemperature := temperature
		if opts.Temperature == nil {
			fallbackTemperature = 0.3
		}
		fallbackTopP := topP
		if opts.TopP == nil {
			fallbackTopP = 0.95
		}
		fallbackOptions := map[string]interface{}{
			"temperature":       fallbackTemperature,
			"top_p":             fallbackTopP,
			"repeat_penalty":    1.05,
			"presence_penalty":  0.0,
			"frequency_penalty": 0.0,
		}
		if normalized := normalizeNumPredict(opts.NumPredict); normalized != nil {
			fallbackOptions["num_predict"] = *normalized
		}
		if opts.NumCtx != nil && *opts.NumCtx > 0 {
			fallbackOptions["num_ctx"] = *opts.NumCtx
		}
		if len(opts.Stop) > 0 {
			fallbackOptions["stop"] = opts.Stop
		}

		altText, altErr := translateWithOllamaGenerate(baseURL, model, fallbackPrompt, systemPrompt, fallbackOptions)
		if altErr == nil {
			translated = cleanupOllamaTranslation(altText)
		}
		if translated == "" {
			fallback, err := translateWithOllamaChat(baseURL, model, fallbackPrompt, systemPrompt, fallbackOptions)
			if err != nil {
				return "", "", fmt.Errorf("no translation returned (model: %s; chat failed: %w)", model, err)
			}
			translated = cleanupOllamaTranslation(fallback)
		}
		if translated == "" {
			return "", "", fmt.Errorf("no translation returned (model: %s)", model)
		}
	}
	return translated, NormalizeLanguageCode(sourceLangCode), nil
}

func normalizeOllamaLangCode(code string) string {
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return ""
	}
	if strings.Contains(trimmed, "_") {
		trimmed = NormalizeFromLangTag(trimmed)
	}
	return NormalizeLanguageCode(trimmed)
}

func languageNameFromInput(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}
	if strings.Contains(trimmed, "_") {
		key := strings.ToLower(trimmed)
		if name, ok := langTagToName[key]; ok {
			return name
		}
	}
	code := NormalizeLanguageCode(trimmed)
	if code == "" {
		return ""
	}
	if name, ok := iso6393ToName[code]; ok {
		return name
	}
	return strings.ToUpper(code)
}

func buildOllamaPrompt(text, targetLangName, sourceLangName string, sourceExplicit bool) string {
	builder := strings.Builder{}
	if sourceExplicit && sourceLangName != "" {
		builder.WriteString("Translate from ")
		builder.WriteString(sourceLangName)
		builder.WriteString(" to ")
		builder.WriteString(targetLangName)
		builder.WriteString(". Output only the translation.\n\n")
	} else {
		builder.WriteString("Translate to ")
		builder.WriteString(targetLangName)
		builder.WriteString(". Output only the translation.\n\n")
	}
	builder.WriteString("Text:\n")
	builder.WriteString(text)
	return builder.String()
}

func cleanupOllamaTranslation(text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.Trim(trimmed, "\"\n\r\t ")
	trimmed = strings.TrimSpace(trimmed)
	if trimmed == "" {
		return ""
	}
	lower := strings.ToLower(trimmed)
	prefixes := []string{"translation:", "translated text:", "訳:", "翻訳:"}
	for _, prefix := range prefixes {
		if strings.HasPrefix(lower, prefix) {
			trimmed = strings.TrimSpace(trimmed[len(prefix):])
			break
		}
	}
	return trimmed
}

func normalizeNumPredict(value *int) *int {
	if value == nil {
		defaultValue := 128
		return &defaultValue
	}
	if *value <= 0 {
		return nil
	}
	if *value > 4096 {
		limit := 4096
		return &limit
	}
	return value
}

func ParseOllamaNumPredict(value string) *int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	parsed, err := strconv.Atoi(trimmed)
	if err != nil || parsed <= 0 || parsed > 4096 {
		return nil
	}
	return &parsed
}

func ParseOllamaTemperature(value string) *float64 {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(trimmed, 64)
	if err != nil || parsed < 0 || parsed > 2.0 {
		return nil
	}
	return &parsed
}

func ParseOllamaTopP(value string) *float64 {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(trimmed, 64)
	if err != nil || parsed < 0 || parsed > 1.0 {
		return nil
	}
	return &parsed
}

func ParseOllamaNumCtx(value string) *int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	parsed, err := strconv.Atoi(trimmed)
	if err != nil || parsed <= 0 || parsed > 131072 {
		return nil
	}
	return &parsed
}

func ParseOllamaStop(value string) []string {
	trimmed := strings.Trim(value, "\r\n")
	if trimmed == "" {
		return nil
	}
	if strings.Contains(trimmed, "\n") || strings.Contains(trimmed, ",") {
		separators := func(r rune) bool {
			return r == '\n' || r == ','
		}
		parts := strings.FieldsFunc(trimmed, separators)
		out := make([]string, 0, len(parts))
		for _, part := range parts {
			item := strings.TrimSpace(part)
			if item == "" {
				continue
			}
			out = append(out, item)
		}
		if len(out) == 0 {
			return nil
		}
		return out
	}
	return []string{trimmed}
}

func resolveOllamaSystemPrompt(model, custom string) string {
	if strings.TrimSpace(custom) != "" {
		return strings.TrimSpace(custom)
	}
	if isHfModelID(model) {
		return ""
	}
	return "You are a translation engine. Respond with only the translated text."
}

func translateWithOllamaGenerate(baseURL, model, prompt, system string, options map[string]interface{}) (string, error) {
	payload := ollamaGenerateRequest{
		Model:  model,
		Prompt: prompt,
		System: system,
		Stream: false,
		Options: func() map[string]interface{} {
			if len(options) == 0 {
				return nil
			}
			return options
		}(),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	endpoint := strings.TrimRight(baseURL, "/") + "/api/generate"
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 3 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("ollama server error: status %d", resp.StatusCode)
	}

	var parsed ollamaGenerateResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if strings.TrimSpace(parsed.Error) != "" {
		return "", fmt.Errorf("ollama error: %s", parsed.Error)
	}

	response := strings.TrimSpace(parsed.Response)
	if response == "" {
		response = strings.TrimSpace(parsed.Thinking)
	}
	return response, nil
}

func buildOllamaFallbackPrompt(text, targetLangName, sourceLangName string, sourceExplicit bool) string {
	builder := strings.Builder{}
	if sourceExplicit && sourceLangName != "" {
		builder.WriteString("Translate the following text from ")
		builder.WriteString(sourceLangName)
		builder.WriteString(" to ")
		builder.WriteString(targetLangName)
		builder.WriteString(".\n")
	} else {
		builder.WriteString("Translate the following text to ")
		builder.WriteString(targetLangName)
		builder.WriteString(".\n")
	}
	builder.WriteString("Output only the translation.\n\n")
	builder.WriteString("Text: ")
	builder.WriteString(text)
	builder.WriteString("\nTranslation: ")
	return builder.String()
}

func isHfModelID(model string) bool {
	normalized := strings.TrimSpace(strings.ToLower(model))
	return strings.HasPrefix(normalized, "hf.co/") ||
		strings.HasPrefix(normalized, "huggingface.co/") ||
		strings.HasPrefix(normalized, "https://huggingface.co/") ||
		strings.HasPrefix(normalized, "http://huggingface.co/")
}

func translateWithOllamaChat(baseURL, model, prompt, system string, options map[string]interface{}) (string, error) {
	messages := make([]ollamaChatMessage, 0, 2)
	if strings.TrimSpace(system) != "" {
		messages = append(messages, ollamaChatMessage{Role: "system", Content: system})
	}
	messages = append(messages, ollamaChatMessage{Role: "user", Content: prompt})

	payload := ollamaChatRequest{
		Model:    model,
		Messages: messages,
		Stream:   false,
		Options: func() map[string]interface{} {
			if len(options) == 0 {
				return nil
			}
			return options
		}(),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	endpoint := strings.TrimRight(baseURL, "/") + "/api/chat"
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 3 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("ollama chat error: status %d", resp.StatusCode)
	}

	var parsed ollamaChatResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if strings.TrimSpace(parsed.Error) != "" {
		return "", fmt.Errorf("ollama chat error: %s", parsed.Error)
	}
	content := strings.TrimSpace(parsed.Message.Content)
	if content == "" {
		content = strings.TrimSpace(parsed.Message.Thinking)
	}
	return content, nil
}
