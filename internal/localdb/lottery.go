package localdb

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// LotterySettings は抽選機能の設定情報を保持する。
type LotterySettings struct {
	ID                int       `json:"id"`
	RewardID          string    `json:"reward_id"`
	LastWinner        string    `json:"last_winner"`
	BaseTicketsLimit  int       `json:"base_tickets_limit"`
	FinalTicketsLimit int       `json:"final_tickets_limit"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// LotteryHistory は抽選履歴を保持する。
type LotteryHistory struct {
	ID                int       `json:"id"`
	WinnerName        string    `json:"winner_name"`
	TotalParticipants int       `json:"total_participants"`
	TotalTickets      int       `json:"total_tickets"`
	ParticipantsJSON  string    `json:"participants_json"`
	RewardIDsJSON     string    `json:"reward_ids_json"`
	DrawnAt           time.Time `json:"drawn_at"`
}

// SetupLotteryTables creates lottery_settings and lottery_history tables.
func SetupLotteryTables(db *sql.DB) error {
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS lottery_settings (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			reward_id TEXT,
			last_winner TEXT,
			base_tickets_limit INTEGER NOT NULL DEFAULT 3,
			final_tickets_limit INTEGER NOT NULL DEFAULT 0,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`); err != nil {
		logger.Error("Failed to create lottery_settings table", zap.Error(err))
		return fmt.Errorf("failed to create lottery_settings table: %w", err)
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS lottery_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			winner_name TEXT NOT NULL,
			total_participants INTEGER NOT NULL,
			total_tickets INTEGER NOT NULL,
			participants_json TEXT,
			reward_ids_json TEXT,
			drawn_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`); err != nil {
		logger.Error("Failed to create lottery_history table", zap.Error(err))
		return fmt.Errorf("failed to create lottery_history table: %w", err)
	}

	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_lottery_history_drawn_at ON lottery_history(drawn_at DESC)`); err != nil {
		logger.Warn("Failed to create lottery_history index", zap.Error(err))
	}

	return nil
}

// GetLotterySettings returns current lottery settings.
func GetLotterySettings() (*LotterySettings, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var settings LotterySettings
	err := db.QueryRow(`
		SELECT id, COALESCE(reward_id, ''), COALESCE(last_winner, ''), base_tickets_limit, final_tickets_limit, updated_at
		FROM lottery_settings
		WHERE id = 1
	`).Scan(
		&settings.ID,
		&settings.RewardID,
		&settings.LastWinner,
		&settings.BaseTicketsLimit,
		&settings.FinalTicketsLimit,
		&settings.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return &LotterySettings{
			ID:                1,
			RewardID:          "",
			LastWinner:        "",
			BaseTicketsLimit:  3,
			FinalTicketsLimit: 0,
			UpdatedAt:         time.Now(),
		}, nil
	}
	if err != nil {
		logger.Error("Failed to get lottery settings", zap.Error(err))
		return nil, fmt.Errorf("failed to get lottery settings: %w", err)
	}

	return &settings, nil
}

// UpdateLotterySettings upserts lottery settings.
func UpdateLotterySettings(settings LotterySettings) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	if settings.BaseTicketsLimit <= 0 {
		settings.BaseTicketsLimit = 3
	}
	if settings.FinalTicketsLimit < 0 {
		settings.FinalTicketsLimit = 0
	}

	_, err := db.Exec(`
		INSERT INTO lottery_settings (
			id, reward_id, last_winner, base_tickets_limit, final_tickets_limit, updated_at
		) VALUES (1, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			reward_id = excluded.reward_id,
			last_winner = excluded.last_winner,
			base_tickets_limit = excluded.base_tickets_limit,
			final_tickets_limit = excluded.final_tickets_limit,
			updated_at = excluded.updated_at
	`,
		settings.RewardID,
		settings.LastWinner,
		settings.BaseTicketsLimit,
		settings.FinalTicketsLimit,
		time.Now(),
	)
	if err != nil {
		logger.Error("Failed to update lottery settings", zap.Error(err))
		return fmt.Errorf("failed to update lottery settings: %w", err)
	}

	return nil
}

// ResetLastWinner resets the last winner in lottery settings.
func ResetLastWinner() error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(`
		INSERT INTO lottery_settings (id, reward_id, last_winner, base_tickets_limit, final_tickets_limit, updated_at)
		VALUES (1, '', '', 3, 0, ?)
		ON CONFLICT(id) DO UPDATE SET
			last_winner = '',
			updated_at = excluded.updated_at
	`, time.Now())
	if err != nil {
		logger.Error("Failed to reset last winner", zap.Error(err))
		return fmt.Errorf("failed to reset last winner: %w", err)
	}

	return nil
}

// SaveLotteryHistory saves one lottery history record.
func SaveLotteryHistory(history LotteryHistory) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	if history.DrawnAt.IsZero() {
		history.DrawnAt = time.Now()
	}

	_, err := db.Exec(`
		INSERT INTO lottery_history (
			winner_name, total_participants, total_tickets, participants_json, reward_ids_json, drawn_at
		) VALUES (?, ?, ?, ?, ?, ?)
	`,
		history.WinnerName,
		history.TotalParticipants,
		history.TotalTickets,
		history.ParticipantsJSON,
		history.RewardIDsJSON,
		history.DrawnAt,
	)
	if err != nil {
		logger.Error("Failed to save lottery history", zap.Error(err))
		return fmt.Errorf("failed to save lottery history: %w", err)
	}

	return nil
}

// GetLotteryHistory returns lottery history ordered by latest first.
func GetLotteryHistory(limit int) ([]LotteryHistory, error) {
	db := GetDB()
	if db == nil {
		return []LotteryHistory{}, fmt.Errorf("database not initialized")
	}

	query := `
		SELECT id, winner_name, total_participants, total_tickets, COALESCE(participants_json, ''), COALESCE(reward_ids_json, ''), drawn_at
		FROM lottery_history
		ORDER BY drawn_at DESC, id DESC
	`

	var (
		rows *sql.Rows
		err  error
	)
	if limit > 0 {
		rows, err = db.Query(query+" LIMIT ?", limit)
	} else {
		rows, err = db.Query(query)
	}
	if err != nil {
		logger.Error("Failed to get lottery history", zap.Error(err))
		return []LotteryHistory{}, fmt.Errorf("failed to get lottery history: %w", err)
	}
	defer rows.Close()

	history := []LotteryHistory{}
	for rows.Next() {
		var item LotteryHistory
		if err := rows.Scan(
			&item.ID,
			&item.WinnerName,
			&item.TotalParticipants,
			&item.TotalTickets,
			&item.ParticipantsJSON,
			&item.RewardIDsJSON,
			&item.DrawnAt,
		); err != nil {
			logger.Error("Failed to scan lottery history", zap.Error(err))
			continue
		}
		history = append(history, item)
	}

	if err := rows.Err(); err != nil {
		logger.Error("Error iterating lottery history", zap.Error(err))
		return []LotteryHistory{}, fmt.Errorf("failed to iterate lottery history: %w", err)
	}

	return history, nil
}

// DeleteLotteryHistory deletes lottery history by id.
func DeleteLotteryHistory(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(`DELETE FROM lottery_history WHERE id = ?`, id)
	if err != nil {
		logger.Error("Failed to delete lottery history", zap.Error(err), zap.Int("id", id))
		return fmt.Errorf("failed to delete lottery history: %w", err)
	}

	return nil
}
