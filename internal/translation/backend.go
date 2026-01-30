package translation

import "strings"

const (
	BackendOpenAI = "openai"
	BackendOllama = "ollama"

	DefaultTranslationBackend = BackendOpenAI
	DefaultOllamaBaseURL      = "http://127.0.0.1:11434"
	DefaultTargetJapanese     = "jpn"
)

func ResolveTranslationBackend(value string) string {
	normalized := strings.TrimSpace(strings.ToLower(value))
	switch normalized {
	case BackendOpenAI:
		return BackendOpenAI
	case BackendOllama:
		return BackendOllama
	default:
		return DefaultTranslationBackend
	}
}
