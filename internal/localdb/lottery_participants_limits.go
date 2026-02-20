package localdb

import (
	"database/sql"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

const defaultBaseTicketsLimit = 3

func getCurrentBaseTicketsLimit(db *sql.DB) int {
	limit := defaultBaseTicketsLimit

	err := db.QueryRow(`
		SELECT base_tickets_limit
		FROM lottery_settings
		WHERE id = 1
	`).Scan(&limit)
	if err != nil {
		if err != sql.ErrNoRows {
			logger.Warn("Failed to read base_tickets_limit, using default", zap.Error(err))
		}
		return defaultBaseTicketsLimit
	}

	if limit <= 0 {
		return defaultBaseTicketsLimit
	}

	return limit
}

func sanitizeEntryCount(entryCount int) int {
	if entryCount <= 0 {
		return 1
	}
	return entryCount
}
