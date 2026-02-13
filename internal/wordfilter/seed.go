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

// SeedVersion is bumped when default word lists are updated.
// Changing this triggers a full reseed on next startup.
const SeedVersion = "v2"

// SeedDefaultWords seeds the database with default word lists from embedded files.
// If the seed version matches, no action is taken.
// If the version differs (or not yet seeded), all words are cleared and re-seeded.
func SeedDefaultWords() error {
	currentVersion, err := localdb.GetWordFilterSeedVersion()
	if err != nil {
		logger.Error("Failed to check word filter seed version", zap.Error(err))
		return err
	}
	if currentVersion == SeedVersion {
		return nil
	}

	if currentVersion != "" {
		logger.Info("Word filter defaults updated, reseeding...",
			zap.String("old_version", currentVersion),
			zap.String("new_version", SeedVersion))
		if err := localdb.ClearAllWordFilterWords(); err != nil {
			return fmt.Errorf("failed to clear old words: %w", err)
		}
	} else {
		logger.Info("Seeding default word filter lists...")
	}

	words, err := loadEmbeddedWords()
	if err != nil {
		return err
	}

	if len(words) > 0 {
		if err := localdb.BulkInsertWordFilterWords(words); err != nil {
			return fmt.Errorf("failed to bulk insert words: %w", err)
		}
		logger.Info("Seeded word filter", zap.Int("count", len(words)))
	}

	if err := localdb.SetWordFilterSeedVersion(SeedVersion); err != nil {
		return fmt.Errorf("failed to set seed version: %w", err)
	}

	return nil
}

func loadEmbeddedWords() ([]localdb.WordFilterWord, error) {
	var words []localdb.WordFilterWord

	err := fs.WalkDir(defaultWordLists, "defaults", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}

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
			return nil
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
		return nil, fmt.Errorf("failed to walk embedded word lists: %w", err)
	}

	return words, nil
}
