package webserver

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/env"
	"github.com/nantokaworks/twitch-overlay/internal/micrecog"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

var micRecogManager *micrecog.Manager

func SetMicRecogManager(manager *micrecog.Manager) {
	micRecogManager = manager
}

func handleMicDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	devices, err := micrecog.ListDevices(ctx)
	if err != nil {
		logger.Warn("Failed to list mic devices", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"devices": devices,
	})
}

func handleMicRestart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if micRecogManager == nil {
		http.Error(w, "mic-recog manager not available", http.StatusServiceUnavailable)
		return
	}

	port := env.Value.ServerPort
	if port == 0 {
		port = 8080
	}

	stopped := micRecogManager.Stop()
	time.Sleep(300 * time.Millisecond)

	if err := micRecogManager.Start(port); err != nil {
		logger.Warn("Failed to restart mic-recog", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{
		"success": true,
	}
	if !stopped {
		response["warning"] = "mic-recog stop timed out; forced restart"
	}
	_ = json.NewEncoder(w).Encode(response)
}

func handleMicStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	status := map[string]interface{}{
		"running": false,
	}
	if micRecogManager == nil {
		status["error"] = "mic-recog manager not available"
	} else {
		status["running"] = micRecogManager.IsRunning()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(status)
}
