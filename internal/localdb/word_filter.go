package localdb

import (
	"fmt"
	"strings"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// WordFilterWord represents a word in the word filter
type WordFilterWord struct {
	ID       int    `json:"id"`
	Language string `json:"language"`
	Word     string `json:"word"`
	Type     string `json:"type"` // "bad" or "good"
}

// GetWordFilterWords returns all words for a given language
func GetWordFilterWords(language string) ([]WordFilterWord, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(
		`SELECT id, language, word, type FROM word_filter_words WHERE language = ? ORDER BY word`,
		language,
	)
	if err != nil {
		logger.Error("Failed to get word filter words", zap.Error(err), zap.String("language", language))
		return nil, fmt.Errorf("failed to get word filter words: %w", err)
	}
	defer rows.Close()

	words := []WordFilterWord{}
	for rows.Next() {
		var w WordFilterWord
		if err := rows.Scan(&w.ID, &w.Language, &w.Word, &w.Type); err != nil {
			logger.Error("Failed to scan word filter word", zap.Error(err))
			continue
		}
		words = append(words, w)
	}
	return words, nil
}

// AddWordFilterWord adds a word to the word filter
func AddWordFilterWord(language, word, wordType string) (*WordFilterWord, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	if wordType != "bad" && wordType != "good" {
		return nil, fmt.Errorf("invalid word type: %s (must be 'bad' or 'good')", wordType)
	}

	result, err := db.Exec(
		`INSERT INTO word_filter_words (language, word, type) VALUES (?, ?, ?)`,
		language, word, wordType,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			return nil, fmt.Errorf("word already exists")
		}
		logger.Error("Failed to add word filter word", zap.Error(err))
		return nil, fmt.Errorf("failed to add word filter word: %w", err)
	}

	id, _ := result.LastInsertId()
	return &WordFilterWord{ID: int(id), Language: language, Word: word, Type: wordType}, nil
}

// DeleteWordFilterWord deletes a word from the word filter by ID
func DeleteWordFilterWord(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	result, err := db.Exec(`DELETE FROM word_filter_words WHERE id = ?`, id)
	if err != nil {
		logger.Error("Failed to delete word filter word", zap.Error(err), zap.Int("id", id))
		return fmt.Errorf("failed to delete word filter word: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("word not found")
	}
	return nil
}

// BulkInsertWordFilterWords inserts multiple words in a single transaction
func BulkInsertWordFilterWords(words []WordFilterWord) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO word_filter_words (language, word, type) VALUES (?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, w := range words {
		if _, err := stmt.Exec(w.Language, w.Word, w.Type); err != nil {
			logger.Error("Failed to insert word", zap.Error(err), zap.String("word", w.Word))
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	return nil
}

// GetWordFilterLanguages returns all languages that have word filter entries
func GetWordFilterLanguages() ([]string, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(`SELECT DISTINCT language FROM word_filter_words ORDER BY language`)
	if err != nil {
		logger.Error("Failed to get word filter languages", zap.Error(err))
		return nil, fmt.Errorf("failed to get word filter languages: %w", err)
	}
	defer rows.Close()

	languages := []string{}
	for rows.Next() {
		var lang string
		if err := rows.Scan(&lang); err != nil {
			continue
		}
		languages = append(languages, lang)
	}
	return languages, nil
}

// IsWordFilterSeeded checks if the word filter has been seeded with defaults
func IsWordFilterSeeded() (bool, error) {
	db := GetDB()
	if db == nil {
		return false, fmt.Errorf("database not initialized")
	}

	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM settings WHERE key = 'word_filter_seeded'`).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// MarkWordFilterSeeded marks the word filter as seeded
func MarkWordFilterSeeded() error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(
		`INSERT OR REPLACE INTO settings (key, value, setting_type) VALUES ('word_filter_seeded', 'true', 'system')`,
	)
	return err
}
