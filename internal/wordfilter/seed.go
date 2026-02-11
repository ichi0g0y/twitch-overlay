package wordfilter

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// SeedDefaultWords seeds the database with default word lists from embedded files.
// This is called once on first startup.
func SeedDefaultWords() error {
	seeded, err := localdb.IsWordFilterSeeded()
	if err != nil {
		logger.Error("Failed to check word filter seeded status", zap.Error(err))
		return err
	}
	if seeded {
		return nil
	}

	logger.Info("Seeding default word filter lists...")

	var words []localdb.WordFilterWord

	err = fs.WalkDir(defaultWordLists, "defaults", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}

		// path is like "defaults/ja/BadList.txt"
		dir := filepath.Dir(path)
		lang := filepath.Base(dir)
		filename := d.Name()

		var wordType string
		switch filename {
		case "BadList.txt":
			wordType = "bad"
		case "GoodList.txt":
			wordType = "good"
		default:
			return nil
		}

		data, err := defaultWordLists.ReadFile(path)
		if err != nil {
			logger.Error("Failed to read embedded word list", zap.Error(err), zap.String("path", path))
			return nil // continue with other files
		}

		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			w := strings.TrimSpace(line)
			if w == "" {
				continue
			}
			words = append(words, localdb.WordFilterWord{
				Language: lang,
				Word:     w,
				Type:     wordType,
			})
		}

		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to walk embedded word lists: %w", err)
	}

	if len(words) > 0 {
		if err := localdb.BulkInsertWordFilterWords(words); err != nil {
			return fmt.Errorf("failed to bulk insert words: %w", err)
		}
		logger.Info("Seeded word filter", zap.Int("count", len(words)))
	}

	if err := localdb.MarkWordFilterSeeded(); err != nil {
		return fmt.Errorf("failed to mark word filter as seeded: %w", err)
	}

	return nil
}
