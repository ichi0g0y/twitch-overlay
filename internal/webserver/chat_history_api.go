package webserver

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/notification"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

type chatHistoryMessage struct {
	ID        int64                       `json:"id"`
	MessageID string                      `json:"messageId,omitempty"`
	UserID    string                      `json:"userId,omitempty"`
	Username  string                      `json:"username"`
	Message   string                      `json:"message"`
	Fragments []notification.FragmentInfo `json:"fragments,omitempty"`
	AvatarURL string                      `json:"avatarUrl,omitempty"`
	Timestamp string                      `json:"timestamp"`
}

// handleChatHistory handles GET /api/chat/history
func handleChatHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	days := 7
	if daysStr := r.URL.Query().Get("days"); daysStr != "" {
		if parsed, err := strconv.Atoi(daysStr); err == nil && parsed > 0 {
			days = parsed
		}
	}

	limit := 0
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	cutoff := time.Now().AddDate(0, 0, -days).Unix()
	if err := localdb.CleanupChatMessagesBefore(cutoff); err != nil {
		logger.Warn("Failed to cleanup chat history", zap.Error(err))
	}

	rows, err := localdb.GetChatMessagesSince(cutoff, limit)
	if err != nil {
		logger.Error("Failed to get chat history", zap.Error(err))
		http.Error(w, "Failed to fetch chat history", http.StatusInternalServerError)
		return
	}

	messages := make([]chatHistoryMessage, 0, len(rows))
	for _, row := range rows {
		var fragments []notification.FragmentInfo
		if row.FragmentsJSON != "" {
			if err := json.Unmarshal([]byte(row.FragmentsJSON), &fragments); err != nil {
				logger.Warn("Failed to parse chat fragments", zap.Error(err))
			}
		}

		timestamp := time.Unix(row.CreatedAt, 0).Format(time.RFC3339)
		messages = append(messages, chatHistoryMessage{
			ID:        row.ID,
			MessageID: row.MessageID,
			UserID:    row.UserID,
			Username:  row.Username,
			Message:   row.Message,
			Fragments: fragments,
			AvatarURL: row.AvatarURL,
			Timestamp: timestamp,
		})
	}

	response := map[string]interface{}{
		"messages":  messages,
		"count":     len(messages),
		"timestamp": time.Now().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		logger.Error("Failed to encode chat history response", zap.Error(err))
	}
}
