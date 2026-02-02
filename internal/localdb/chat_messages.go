package localdb

import (
	"database/sql"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

type ChatMessageRow struct {
	ID                int64
	MessageID         string
	UserID            string
	Username          string
	Message           string
	FragmentsJSON     string
	AvatarURL         string
	Translation       string
	TranslationStatus string
	TranslationLang   string
	CreatedAt         int64
}

// SetupChatMessagesTable creates the chat_messages table for sidebar history.
func SetupChatMessagesTable(db *sql.DB) error {
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS chat_messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		message_id TEXT,
		user_id TEXT,
		username TEXT NOT NULL,
		message TEXT NOT NULL,
		fragments_json TEXT,
		avatar_url TEXT DEFAULT '',
		translation_text TEXT DEFAULT '',
		translation_status TEXT DEFAULT '',
		translation_lang TEXT DEFAULT '',
		created_at INTEGER NOT NULL
	)`

	if _, err := db.Exec(createTableSQL); err != nil {
		logger.Error("Failed to create chat_messages table", zap.Error(err))
		return err
	}

	// Add column for existing tables (ignore error if already exists)
	_, _ = db.Exec(`ALTER TABLE chat_messages ADD COLUMN message_id TEXT`)
	_, _ = db.Exec(`ALTER TABLE chat_messages ADD COLUMN translation_text TEXT`)
	_, _ = db.Exec(`ALTER TABLE chat_messages ADD COLUMN translation_status TEXT`)
	_, _ = db.Exec(`ALTER TABLE chat_messages ADD COLUMN translation_lang TEXT`)

	if _, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_message_id ON chat_messages(message_id) WHERE message_id IS NOT NULL AND message_id != ''`); err != nil {
		logger.Warn("Failed to create chat_messages message_id index", zap.Error(err))
	}

	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)`); err != nil {
		logger.Warn("Failed to create chat_messages index", zap.Error(err))
	}

	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id)`); err != nil {
		logger.Warn("Failed to create chat_messages user_id index", zap.Error(err))
	}

	logger.Info("chat_messages table created successfully")
	return nil
}

// AddChatMessage inserts a chat message into the database.
// Returns true if inserted, false if ignored due to duplicate message_id.
func AddChatMessage(message ChatMessageRow) (bool, error) {
	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return false, sql.ErrConnDone
	}

	if message.CreatedAt == 0 {
		message.CreatedAt = time.Now().Unix()
	}

	insertSQL := `
	INSERT OR IGNORE INTO chat_messages (message_id, user_id, username, message, fragments_json, avatar_url, translation_text, translation_status, translation_lang, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	result, err := db.Exec(insertSQL,
		message.MessageID,
		message.UserID,
		message.Username,
		message.Message,
		message.FragmentsJSON,
		message.AvatarURL,
		message.Translation,
		message.TranslationStatus,
		message.TranslationLang,
		message.CreatedAt,
	)
	if err != nil {
		logger.Error("Failed to insert chat message", zap.Error(err))
		return false, err
	}

	if rowsAffected, err := result.RowsAffected(); err == nil && rowsAffected == 0 {
		return false, nil
	}

	return true, nil
}

// GetChatMessagesSince returns chat messages newer than the given timestamp (unix seconds).
func GetChatMessagesSince(sinceUnix int64, limit int) ([]ChatMessageRow, error) {
	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return nil, sql.ErrConnDone
	}

	query := `
	SELECT id, message_id, user_id, username, message, fragments_json, avatar_url, translation_text, translation_status, translation_lang, created_at
	FROM chat_messages
	WHERE created_at >= ?
	ORDER BY created_at ASC
	`

	var rows *sql.Rows
	var err error
	if limit > 0 {
		queryWithLimit := query + " LIMIT ?"
		rows, err = db.Query(queryWithLimit, sinceUnix, limit)
	} else {
		rows, err = db.Query(query, sinceUnix)
	}
	if err != nil {
		logger.Error("Failed to query chat messages", zap.Error(err))
		return nil, err
	}
	defer rows.Close()

	messages := []ChatMessageRow{}
	for rows.Next() {
		var row ChatMessageRow
		if err := rows.Scan(
			&row.ID,
			&row.MessageID,
			&row.UserID,
			&row.Username,
			&row.Message,
			&row.FragmentsJSON,
			&row.AvatarURL,
			&row.Translation,
			&row.TranslationStatus,
			&row.TranslationLang,
			&row.CreatedAt,
		); err != nil {
			logger.Error("Failed to scan chat message", zap.Error(err))
			continue
		}
		messages = append(messages, row)
	}

	if err := rows.Err(); err != nil {
		logger.Error("Error iterating chat messages", zap.Error(err))
		return nil, err
	}

	return messages, nil
}

// CleanupChatMessagesBefore deletes chat messages older than the cutoff timestamp (unix seconds).
func CleanupChatMessagesBefore(cutoffUnix int64) error {
	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return sql.ErrConnDone
	}

	result, err := db.Exec(`DELETE FROM chat_messages WHERE created_at < ?`, cutoffUnix)
	if err != nil {
		logger.Error("Failed to cleanup chat messages", zap.Error(err))
		return err
	}

	if rowsAffected, err := result.RowsAffected(); err == nil && rowsAffected > 0 {
		logger.Debug("Cleaned up old chat messages", zap.Int64("deleted", rowsAffected))
	}

	return nil
}

// GetLatestChatAvatar returns the latest avatar URL stored for a user.
func GetLatestChatAvatar(userID string) (string, error) {
	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return "", sql.ErrConnDone
	}

	var avatarURL string
	err := db.QueryRow(
		`SELECT avatar_url FROM chat_messages WHERE user_id = ? AND avatar_url != '' ORDER BY created_at DESC LIMIT 1`,
		userID,
	).Scan(&avatarURL)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		logger.Error("Failed to query latest avatar", zap.Error(err))
		return "", err
	}

	return avatarURL, nil
}

// ChatMessageExistsByMessageID checks if a message with the given message_id exists.
func ChatMessageExistsByMessageID(messageID string) (bool, error) {
	if messageID == "" {
		return false, nil
	}

	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return false, sql.ErrConnDone
	}

	var exists int
	err := db.QueryRow(`SELECT 1 FROM chat_messages WHERE message_id = ? LIMIT 1`, messageID).Scan(&exists)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		logger.Error("Failed to check chat message existence", zap.Error(err))
		return false, err
	}

	return true, nil
}

// UpdateChatTranslation updates translation text/status/lang for a message_id.
func UpdateChatTranslation(messageID, translationText, status, lang string) error {
	if messageID == "" {
		return nil
	}

	db := GetDB()
	if db == nil {
		logger.Error("Database not initialized")
		return sql.ErrConnDone
	}

	_, err := db.Exec(
		`UPDATE chat_messages SET translation_text = ?, translation_status = ?, translation_lang = ? WHERE message_id = ?`,
		translationText,
		status,
		lang,
		messageID,
	)
	if err != nil {
		logger.Error("Failed to update chat translation", zap.Error(err))
		return err
	}

	return nil
}
