package webserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/ollama"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/paths"
	"github.com/nantokaworks/twitch-overlay/internal/translation"
)

type ollamaModelRequest struct {
	Model string `json:"model"`
}

type ollamaModelItem struct {
	ID          string `json:"id"`
	SizeBytes   int64  `json:"size_bytes,omitempty"`
	ModifiedAt  string `json:"modified_at,omitempty"`
	SizeDisplay string `json:"size_display,omitempty"`
}

type ollamaModelfileRequest struct {
	Name      string `json:"name"`
	Create    bool   `json:"create"`
	Apply     bool   `json:"apply"`
	BaseModel string `json:"base_model,omitempty"`
}

var ollamaManager *ollama.Manager

func SetOllamaManager(manager *ollama.Manager) {
	ollamaManager = manager
}

func handleOllamaStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	running := false
	if ollamaManager != nil {
		running = ollamaManager.IsRunning()
	}

	baseURL := translation.ResolveOllamaBaseURL(getSettingValueFromDB("OLLAMA_BASE_URL"))
	healthy, version, err := getOllamaHealth(baseURL, 2*time.Second)
	model := strings.TrimSpace(getSettingValueFromDB("OLLAMA_MODEL"))

	resp := map[string]interface{}{
		"running": running,
		"healthy": healthy,
		"model":   model,
	}
	if version != "" {
		resp["version"] = version
	}
	if err != nil {
		resp["error"] = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func handleOllamaModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	baseURL := translation.ResolveOllamaBaseURL(getSettingValueFromDB("OLLAMA_BASE_URL"))
	models, err := fetchOllamaModels(baseURL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	payload := map[string]interface{}{
		"models":    models,
		"cached_at": time.Now().Unix(),
	}
	writeJSON(w, payload)
}

func handleOllamaPull(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ollamaModelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	req.Model = strings.TrimSpace(req.Model)
	if req.Model == "" {
		http.Error(w, "model is required", http.StatusBadRequest)
		return
	}

	baseURL := translation.ResolveOllamaBaseURL(getSettingValueFromDB("OLLAMA_BASE_URL"))
	payload, _ := json.Marshal(map[string]interface{}{
		"name":   req.Model,
		"stream": false,
	})
	respBody, status, err := proxyOllamaRequest(baseURL, http.MethodPost, "/api/pull", payload, 30*time.Minute)
	if err != nil {
		http.Error(w, err.Error(), status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(respBody)
}

func handleOllamaModelfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ollamaModelfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	baseModel := strings.TrimSpace(req.BaseModel)
	if baseModel == "" {
		baseModel = getSettingValueFromDB("OLLAMA_BASE_MODEL")
	}
	if baseModel == "" {
		baseModel = getSettingValueFromDB("OLLAMA_MODEL")
	}

	numPredict := translation.ParseOllamaNumPredict(getSettingValueFromDB("OLLAMA_NUM_PREDICT"))
	modelfile, err := ollama.BuildModelfile(ollama.ModelfileConfig{
		BaseModel:    baseModel,
		SystemPrompt: getSettingValueFromDB("OLLAMA_SYSTEM_PROMPT"),
		NumPredict:   numPredict,
		Temperature:  translation.ParseOllamaTemperature(getSettingValueFromDB("OLLAMA_TEMPERATURE")),
		TopP:         translation.ParseOllamaTopP(getSettingValueFromDB("OLLAMA_TOP_P")),
		NumCtx:       translation.ParseOllamaNumCtx(getSettingValueFromDB("OLLAMA_NUM_CTX")),
		Stop:         translation.ParseOllamaStop(getSettingValueFromDB("OLLAMA_STOP")),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	modelfileDir := filepath.Join(paths.GetDataDir(), "ollama", "modelfiles")
	modelfilePath, err := ollama.SaveModelfile(modelfileDir, name, modelfile)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	created := false
	if req.Create {
		if err := ollama.CreateModel(name, modelfilePath, 45*time.Minute); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		created = true
	}

	applied := false
	if req.Apply {
		manager := settings.NewSettingsManager(localdb.GetDB())
		if err := manager.SetSetting("OLLAMA_MODEL", name); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		applied = true
	}

	response := map[string]interface{}{
		"name":       name,
		"base_model": baseModel,
		"modelfile":  modelfile,
		"path":       modelfilePath,
		"created":    created,
		"applied":    applied,
	}
	writeJSON(w, response)
}

func fetchOllamaModels(baseURL string) ([]ollamaModelItem, error) {
	respBody, status, err := proxyOllamaRequest(baseURL, http.MethodGet, "/api/tags", nil, 10*time.Second)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("ollama tags error: status %d", status)
	}

	var parsed struct {
		Models []struct {
			Name       string `json:"name"`
			Size       int64  `json:"size"`
			ModifiedAt string `json:"modified_at"`
		} `json:"models"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, err
	}

	items := make([]ollamaModelItem, 0, len(parsed.Models))
	for _, model := range parsed.Models {
		id := strings.TrimSpace(model.Name)
		if id == "" {
			continue
		}
		items = append(items, ollamaModelItem{
			ID:         id,
			SizeBytes:  model.Size,
			ModifiedAt: model.ModifiedAt,
		})
	}
	return items, nil
}

func getOllamaHealth(baseURL string, timeout time.Duration) (bool, string, error) {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return false, "", fmt.Errorf("base url is empty")
	}
	endpoint := strings.TrimRight(baseURL, "/") + "/api/version"
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return false, "", err
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return false, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, "", fmt.Errorf("health check failed: status %d", resp.StatusCode)
	}

	var payload struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return true, "", nil
	}
	return true, strings.TrimSpace(payload.Version), nil
}

func proxyOllamaRequest(baseURL, method, path string, body []byte, timeout time.Duration) ([]byte, int, error) {
	if strings.TrimSpace(baseURL) == "" {
		return nil, http.StatusBadGateway, fmt.Errorf("ollama base url is empty")
	}
	endpoint := strings.TrimRight(baseURL, "/") + path

	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, endpoint, reader)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	return respBody, resp.StatusCode, nil
}
