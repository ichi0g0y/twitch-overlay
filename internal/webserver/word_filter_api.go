package webserver

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// handleWordFilter handles GET (list words) and POST (add word) for /api/word-filter
func handleWordFilter(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleGetWordFilterWords(w, r)
	case http.MethodPost:
		handleAddWordFilterWord(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleWordFilterByPath handles /api/word-filter/languages and /api/word-filter/{id}
func handleWordFilterByPath(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/word-filter/")

	if path == "languages" {
		handleGetWordFilterLanguages(w, r)
		return
	}

	// DELETE /api/word-filter/{id}
	if r.Method == http.MethodDelete {
		id, err := strconv.Atoi(path)
		if err != nil {
			http.Error(w, "Invalid word ID", http.StatusBadRequest)
			return
		}
		handleDeleteWordFilterWord(w, r, id)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

// handleGetWordFilterWords returns words for a given language
func handleGetWordFilterWords(w http.ResponseWriter, r *http.Request) {
	lang := r.URL.Query().Get("lang")
	if lang == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"data": []localdb.WordFilterWord{}})
		return
	}

	words, err := localdb.GetWordFilterWords(lang)
	if err != nil {
		logger.Error("Failed to get word filter words", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "ワードの取得に失敗しました"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": words})
}

// handleAddWordFilterWord adds a new word
func handleAddWordFilterWord(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Language string `json:"language"`
		Word     string `json:"word"`
		Type     string `json:"type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Word = strings.TrimSpace(req.Word)
	if req.Language == "" || req.Word == "" || req.Type == "" {
		http.Error(w, "language, word, and type are required", http.StatusBadRequest)
		return
	}

	word, err := localdb.AddWordFilterWord(req.Language, req.Word, req.Type)
	if err != nil {
		logger.Error("Failed to add word filter word", zap.Error(err))
		status := http.StatusInternalServerError
		msg := "ワードの追加に失敗しました"
		if strings.Contains(err.Error(), "already exists") {
			status = http.StatusConflict
			msg = "このワードは既に登録されています"
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]string{"error": msg})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(word)
}

// handleDeleteWordFilterWord deletes a word by ID
func handleDeleteWordFilterWord(w http.ResponseWriter, _ *http.Request, id int) {
	if err := localdb.DeleteWordFilterWord(id); err != nil {
		logger.Error("Failed to delete word filter word", zap.Error(err), zap.Int("id", id))
		status := http.StatusInternalServerError
		msg := "ワードの削除に失敗しました"
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
			msg = "ワードが見つかりません"
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]string{"error": msg})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// handleGetWordFilterLanguages returns all languages with registered words
func handleGetWordFilterLanguages(w http.ResponseWriter, _ *http.Request) {
	languages, err := localdb.GetWordFilterLanguages()
	if err != nil {
		logger.Error("Failed to get word filter languages", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "言語一覧の取得に失敗しました"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": languages})
}
