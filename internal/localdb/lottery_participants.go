package localdb

import (
	"database/sql"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/types"
	"go.uber.org/zap"
)

// SetupLotteryParticipantsTable はlottery_participantsテーブルを作成
func SetupLotteryParticipantsTable(db *sql.DB) error {
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS lottery_participants (
		user_id TEXT PRIMARY KEY,
		username TEXT NOT NULL,
		display_name TEXT NOT NULL,
		avatar_url TEXT DEFAULT '',
		redeemed_at TIMESTAMP NOT NULL,
		is_subscriber BOOLEAN NOT NULL DEFAULT false,
		subscribed_months INTEGER NOT NULL DEFAULT 0,
		subscriber_tier TEXT DEFAULT '',
		entry_count INTEGER NOT NULL DEFAULT 1,
		assigned_color TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`

	_, err := db.Exec(createTableSQL)
	if err != nil {
		logger.Error("Failed to create lottery_participants table", zap.Error(err))
		return err
	}

	logger.Info("lottery_participants table created successfully")
	return nil
}

// AddLotteryParticipant は参加者を追加または更新（UPSERT）
func AddLotteryParticipant(participant types.PresentParticipant) error {
	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return sql.ErrConnDone
	}

	insertSQL := `
	INSERT INTO lottery_participants (
		user_id, username, display_name, avatar_url, redeemed_at,
		is_subscriber, subscriber_tier, entry_count, assigned_color, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(user_id) DO UPDATE SET
		username = excluded.username,
		display_name = excluded.display_name,
		avatar_url = excluded.avatar_url,
		redeemed_at = excluded.redeemed_at,
		is_subscriber = excluded.is_subscriber,
		subscriber_tier = excluded.subscriber_tier,
		entry_count = lottery_participants.entry_count + excluded.entry_count,
		assigned_color = excluded.assigned_color,
		updated_at = excluded.updated_at
	`

	_, err := db.Exec(insertSQL,
		participant.UserID,
		participant.Username,
		participant.DisplayName,
		participant.AvatarURL,
		participant.RedeemedAt,
		participant.IsSubscriber,
		participant.SubscriberTier,
		participant.EntryCount,
		participant.AssignedColor,
		time.Now(),
	)

	if err != nil {
		logger.Error("Failed to add/update lottery participant",
			zap.String("user_id", participant.UserID),
			zap.Error(err))
		return err
	}

	logger.Debug("Lottery participant added/updated successfully",
		zap.String("user_id", participant.UserID),
		zap.String("username", participant.Username))

	// WALチェックポイントを実行して変更をメインDBに反映
	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		logger.Warn("Failed to checkpoint WAL after adding participant", zap.Error(err))
	}

	return nil
}

// GetAllLotteryParticipants は全参加者を取得
func GetAllLotteryParticipants() ([]types.PresentParticipant, error) {
	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return nil, sql.ErrConnDone
	}

	selectSQL := `
	SELECT user_id, username, display_name, avatar_url, redeemed_at,
	       is_subscriber, subscriber_tier, entry_count, assigned_color
	FROM lottery_participants
	ORDER BY redeemed_at ASC
	`

	rows, err := db.Query(selectSQL)
	if err != nil {
		logger.Error("Failed to query lottery participants", zap.Error(err))
		return nil, err
	}
	defer rows.Close()

	var participants []types.PresentParticipant
	for rows.Next() {
		var p types.PresentParticipant
		err := rows.Scan(
			&p.UserID,
			&p.Username,
			&p.DisplayName,
			&p.AvatarURL,
			&p.RedeemedAt,
			&p.IsSubscriber,
			&p.SubscriberTier,
			&p.EntryCount,
			&p.AssignedColor,
		)
		if err != nil {
			logger.Error("Failed to scan lottery participant", zap.Error(err))
			continue
		}
		participants = append(participants, p)
	}

	if err = rows.Err(); err != nil {
		logger.Error("Error iterating lottery participants", zap.Error(err))
		return nil, err
	}

	logger.Debug("Fetched lottery participants from database",
		zap.Int("count", len(participants)))

	return participants, nil
}

// DeleteLotteryParticipant は指定された参加者を削除
func DeleteLotteryParticipant(userID string) error {
	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return sql.ErrConnDone
	}

	deleteSQL := `DELETE FROM lottery_participants WHERE user_id = ?`

	result, err := db.Exec(deleteSQL, userID)
	if err != nil {
		logger.Error("Failed to delete lottery participant",
			zap.String("user_id", userID),
			zap.Error(err))
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	logger.Debug("Lottery participant deleted",
		zap.String("user_id", userID),
		zap.Int64("rows_affected", rowsAffected))

	// WALチェックポイントを実行して変更をメインDBに反映
	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		logger.Warn("Failed to checkpoint WAL after deleting participant", zap.Error(err))
	}

	return nil
}

// UpdateLotteryParticipant は指定された参加者を更新
func UpdateLotteryParticipant(userID string, participant types.PresentParticipant) error {
	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return sql.ErrConnDone
	}

	updateSQL := `
	UPDATE lottery_participants
	SET username = ?, display_name = ?, avatar_url = ?,
	    is_subscriber = ?, subscriber_tier = ?,
	    entry_count = ?, assigned_color = ?, updated_at = ?
	WHERE user_id = ?
	`

	result, err := db.Exec(updateSQL,
		participant.Username,
		participant.DisplayName,
		participant.AvatarURL,
		participant.IsSubscriber,
		participant.SubscriberTier,
		participant.EntryCount,
		participant.AssignedColor,
		time.Now(),
		userID,
	)

	if err != nil {
		logger.Error("Failed to update lottery participant",
			zap.String("user_id", userID),
			zap.Error(err))
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	logger.Debug("Lottery participant updated",
		zap.String("user_id", userID),
		zap.Int64("rows_affected", rowsAffected))

	// WALチェックポイントを実行して変更をメインDBに反映
	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		logger.Warn("Failed to checkpoint WAL after updating participant", zap.Error(err))
	}

	return nil
}

// ClearAllLotteryParticipants は全参加者を削除
func ClearAllLotteryParticipants() error {
	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return sql.ErrConnDone
	}

	deleteSQL := `DELETE FROM lottery_participants`

	result, err := db.Exec(deleteSQL)
	if err != nil {
		logger.Error("Failed to clear lottery participants", zap.Error(err))
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	logger.Info("All lottery participants cleared",
		zap.Int64("rows_affected", rowsAffected))

	// WALチェックポイントを実行して変更をメインDBに反映
	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		logger.Warn("Failed to checkpoint WAL after clearing participants", zap.Error(err))
	}

	return nil
}
