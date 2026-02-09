package webserver

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/output"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// handlePrinterTestPrint triggers a test print (clock) using current settings.
func handlePrinterTestPrint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	printerType := env.Value.PrinterType
	if printerType == "" {
		printerType = "bluetooth"
	}

	// Check if printer is configured based on printer type
	switch printerType {
	case "bluetooth":
		if env.Value.PrinterAddress == nil || *env.Value.PrinterAddress == "" {
			http.Error(w, "bluetooth printer address not configured", http.StatusBadRequest)
			return
		}
	case "usb":
		if env.Value.USBPrinterName == "" {
			http.Error(w, "USB printer name not configured", http.StatusBadRequest)
			return
		}
	default:
		http.Error(w, "printer type not configured", http.StatusBadRequest)
		return
	}

	testTime := time.Now().Format("15:04")
	logger.Info("Starting test print via API",
		zap.String("printer_type", printerType),
		zap.String("time", testTime))

	// Force print with empty leaderboard (matches the old Wails binding behavior)
	if err := output.PrintClockWithOptionsForce(testTime, true, true); err != nil {
		logger.Error("Failed to print test pattern", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Test print queued",
	})
}

