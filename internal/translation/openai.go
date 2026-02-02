package translation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

const (
	openAIResponsesEndpoint = "https://api.openai.com/v1/responses"
	defaultModel            = "gpt-4o-mini"
)

type responsesAPIResponse struct {
	OutputText string `json:"output_text"`
	Output     []struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
	Usage *responseUsage `json:"usage"`
}

type responseUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
	TotalTokens  int `json:"total_tokens"`
}

type translationResult struct {
	Translation string `json:"translation"`
	SourceLang  string `json:"source_lang"`
}

// TranslateToTargetLanguage translates text to target language using OpenAI Responses API.
func TranslateToTargetLanguage(apiKey, text, model, targetLanguage string) (string, string, error) {
	if strings.TrimSpace(text) == "" {
		return "", "", nil
	}

	model = strings.TrimSpace(model)
	if model == "" {
		model = defaultModel
	}

	targetLanguage = strings.TrimSpace(targetLanguage)
	if targetLanguage == "" {
		targetLanguage = "eng"
	}

	payload := map[string]interface{}{
		"model":       model,
		"temperature": 0.2,
		"input": fmt.Sprintf(
			"次の文章を指定言語へ翻訳してください。対象言語コード（ISO 639-3）は次です: %s。\n入力が既に対象言語なら原文をそのまま返してください。\n元の言語コードはISO 639-3の3文字で返してください。\n\n%s",
			targetLanguage,
			text,
		),
		"text": map[string]interface{}{
			"format": map[string]interface{}{
				"type": "json_schema",
				"name": "translation_result",
				"schema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"translation": map[string]interface{}{
							"type": "string",
						},
						"source_lang": map[string]interface{}{
							"type": "string",
						},
					},
					"required":             []string{"translation", "source_lang"},
					"additionalProperties": false,
				},
				"strict": true,
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	req, err := http.NewRequest("POST", openAIResponsesEndpoint, bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("openai api error: status %d", resp.StatusCode)
	}

	var parsed responsesAPIResponse
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return "", "", err
	}

	if parsed.Usage != nil && (parsed.Usage.InputTokens > 0 || parsed.Usage.OutputTokens > 0) {
		if _, _, err := AddOpenAIUsage(model, parsed.Usage.InputTokens, parsed.Usage.OutputTokens); err != nil {
			logger.Warn("Failed to record OpenAI usage", zap.Error(err))
		}
	}

	outputText := extractResponseText(parsed)
	if outputText == "" {
		return "", "", fmt.Errorf("no translation returned")
	}

	var result translationResult
	if err := json.Unmarshal([]byte(outputText), &result); err == nil {
		return strings.TrimSpace(result.Translation), NormalizeLanguageCode(result.SourceLang), nil
	}

	return outputText, "und", nil
}

// TranslateToJapanese translates text to Japanese using OpenAI Responses API.
func TranslateToJapanese(apiKey, text, model string) (string, string, error) {
	return TranslateToTargetLanguage(apiKey, text, model, DefaultTargetJapanese)
}

func extractResponseText(parsed responsesAPIResponse) string {
	if strings.TrimSpace(parsed.OutputText) != "" {
		return strings.TrimSpace(parsed.OutputText)
	}

	for _, output := range parsed.Output {
		for _, content := range output.Content {
			if strings.TrimSpace(content.Text) != "" {
				return strings.TrimSpace(content.Text)
			}
		}
	}

	return ""
}
