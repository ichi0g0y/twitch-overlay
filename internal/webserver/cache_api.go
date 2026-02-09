package webserver

import (
	"encoding/json"
	"net/http"

	"github.com/ichi0g0y/twitch-overlay/internal/cache"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

func handleCacheSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		settings, err := cache.GetCacheSettings()
		if err != nil {
			logger.Error("Failed to get cache settings", zap.Error(err))
			http.Error(w, "Failed to get cache settings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(settings)
		return
	case http.MethodPut:
		var settings cache.CacheSettings
		if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if err := cache.UpdateCacheSettings(&settings); err != nil {
			logger.Error("Failed to update cache settings", zap.Error(err))
			http.Error(w, "Failed to update cache settings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func handleCacheStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	stats, err := cache.GetCacheStats()
	if err != nil {
		logger.Error("Failed to get cache stats", zap.Error(err))
		http.Error(w, "Failed to get cache stats", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func handleCacheClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := cache.ClearAllCache(); err != nil {
		logger.Error("Failed to clear cache", zap.Error(err))
		http.Error(w, "Failed to clear cache", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func handleCacheCleanup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := cache.CleanupExpiredEntries(); err != nil {
		logger.Error("Failed to cleanup expired cache entries", zap.Error(err))
		http.Error(w, "Failed to cleanup cache", http.StatusInternalServerError)
		return
	}
	if err := cache.CleanupOversizeCache(); err != nil {
		logger.Error("Failed to cleanup oversize cache", zap.Error(err))
		http.Error(w, "Failed to cleanup cache", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

