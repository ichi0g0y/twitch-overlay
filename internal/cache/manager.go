package cache

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// CacheEntry represents a cache file entry
type CacheEntry struct {
	ID            int64     `json:"id"`
	URLHash       string    `json:"url_hash"`
	OriginalURL   string    `json:"original_url"`
	FilePath      string    `json:"file_path"`
	FileSize      int64     `json:"file_size"`
	CreatedAt     time.Time `json:"created_at"`
	LastAccessedAt time.Time `json:"last_accessed_at"`
}

// CacheSettings represents cache configuration
type CacheSettings struct {
	ExpiryDays      int  `json:"expiry_days"`
	MaxSizeMB       int  `json:"max_size_mb"`
	CleanupEnabled  bool `json:"cleanup_enabled"`
	CleanupOnStart  bool `json:"cleanup_on_start"`
}

// CacheStats represents cache statistics
type CacheStats struct {
	TotalFiles     int   `json:"total_files"`
	TotalSizeMB    float64 `json:"total_size_mb"`
	OldestFileDate time.Time `json:"oldest_file_date"`
	ExpiredFiles   int   `json:"expired_files"`
}

// AddCacheEntry adds a new cache entry to the database
func AddCacheEntry(urlHash, originalURL, filePath string, fileSize int64) error {
	db := localdb.GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	// Check if entry already exists
	var existingID int64
	err := db.QueryRow("SELECT id FROM cache_entries WHERE url_hash = ?", urlHash).Scan(&existingID)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("failed to check existing entry: %w", err)
	}

	if err == nil {
		// Update existing entry
		_, err = db.Exec("UPDATE cache_entries SET last_accessed_at = CURRENT_TIMESTAMP, file_size = ? WHERE id = ?", fileSize, existingID)
		if err != nil {
			return fmt.Errorf("failed to update cache entry: %w", err)
		}
		logger.Debug("Updated cache entry", zap.String("url_hash", urlHash))
		return nil
	}

	// Insert new entry
	_, err = db.Exec(`INSERT INTO cache_entries (url_hash, original_url, file_path, file_size, created_at, last_accessed_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		urlHash, originalURL, filePath, fileSize)
	if err != nil {
		return fmt.Errorf("failed to insert cache entry: %w", err)
	}

	logger.Debug("Added cache entry", zap.String("url_hash", urlHash), zap.String("original_url", originalURL))
	return nil
}

// GetCacheEntry gets a cache entry by URL hash
func GetCacheEntry(urlHash string) (*CacheEntry, error) {
	db := localdb.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	entry := &CacheEntry{}
	err := db.QueryRow(`SELECT id, url_hash, original_url, file_path, file_size, created_at, last_accessed_at
		FROM cache_entries WHERE url_hash = ?`, urlHash).Scan(
		&entry.ID, &entry.URLHash, &entry.OriginalURL, &entry.FilePath,
		&entry.FileSize, &entry.CreatedAt, &entry.LastAccessedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get cache entry: %w", err)
	}

	// Update last accessed time
	_, err = db.Exec("UPDATE cache_entries SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?", entry.ID)
	if err != nil {
		logger.Warn("Failed to update last accessed time", zap.Error(err))
	}

	return entry, nil
}

// GetCacheSettings retrieves cache settings from database
func GetCacheSettings() (*CacheSettings, error) {
	db := localdb.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	settings := &CacheSettings{}

	// Get expiry days
	var expiryStr string
	err := db.QueryRow("SELECT value FROM settings WHERE key = 'cache_expiry_days'").Scan(&expiryStr)
	if err != nil {
		return nil, fmt.Errorf("failed to get cache expiry days: %w", err)
	}
	settings.ExpiryDays, _ = strconv.Atoi(expiryStr)

	// Get max size
	var maxSizeStr string
	err = db.QueryRow("SELECT value FROM settings WHERE key = 'cache_max_size_mb'").Scan(&maxSizeStr)
	if err != nil {
		return nil, fmt.Errorf("failed to get cache max size: %w", err)
	}
	settings.MaxSizeMB, _ = strconv.Atoi(maxSizeStr)

	// Get cleanup enabled
	var cleanupEnabledStr string
	err = db.QueryRow("SELECT value FROM settings WHERE key = 'cache_cleanup_enabled'").Scan(&cleanupEnabledStr)
	if err != nil {
		return nil, fmt.Errorf("failed to get cache cleanup enabled: %w", err)
	}
	settings.CleanupEnabled = cleanupEnabledStr == "true"

	// Get cleanup on start
	var cleanupOnStartStr string
	err = db.QueryRow("SELECT value FROM settings WHERE key = 'cache_cleanup_on_start'").Scan(&cleanupOnStartStr)
	if err != nil {
		return nil, fmt.Errorf("failed to get cache cleanup on start: %w", err)
	}
	settings.CleanupOnStart = cleanupOnStartStr == "true"

	return settings, nil
}

// UpdateCacheSettings updates cache settings in database
func UpdateCacheSettings(settings *CacheSettings) error {
	db := localdb.GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Update expiry days
	_, err = tx.Exec("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'cache_expiry_days'",
		strconv.Itoa(settings.ExpiryDays))
	if err != nil {
		return fmt.Errorf("failed to update cache expiry days: %w", err)
	}

	// Update max size
	_, err = tx.Exec("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'cache_max_size_mb'",
		strconv.Itoa(settings.MaxSizeMB))
	if err != nil {
		return fmt.Errorf("failed to update cache max size: %w", err)
	}

	// Update cleanup enabled
	_, err = tx.Exec("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'cache_cleanup_enabled'",
		fmt.Sprintf("%t", settings.CleanupEnabled))
	if err != nil {
		return fmt.Errorf("failed to update cache cleanup enabled: %w", err)
	}

	// Update cleanup on start
	_, err = tx.Exec("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'cache_cleanup_on_start'",
		fmt.Sprintf("%t", settings.CleanupOnStart))
	if err != nil {
		return fmt.Errorf("failed to update cache cleanup on start: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	logger.Info("Updated cache settings",
		zap.Int("expiry_days", settings.ExpiryDays),
		zap.Int("max_size_mb", settings.MaxSizeMB),
		zap.Bool("cleanup_enabled", settings.CleanupEnabled),
		zap.Bool("cleanup_on_start", settings.CleanupOnStart))

	return nil
}

// GetCacheStats calculates cache statistics
func GetCacheStats() (*CacheStats, error) {
	db := localdb.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	stats := &CacheStats{}

	// Get total files and size
	err := db.QueryRow("SELECT COUNT(*), COALESCE(SUM(file_size), 0) FROM cache_entries").Scan(&stats.TotalFiles, &stats.TotalSizeMB)
	if err != nil {
		return nil, fmt.Errorf("failed to get cache stats: %w", err)
	}

	// Convert bytes to MB
	stats.TotalSizeMB = stats.TotalSizeMB / (1024 * 1024)

	// Get oldest file date
	if stats.TotalFiles > 0 {
		err = db.QueryRow("SELECT created_at FROM cache_entries ORDER BY created_at ASC LIMIT 1").Scan(&stats.OldestFileDate)
		if err != nil {
			logger.Warn("Failed to get oldest file date", zap.Error(err))
		}
	}

	// Get expired files count
	settings, err := GetCacheSettings()
	if err != nil {
		logger.Warn("Failed to get cache settings for expired count", zap.Error(err))
	} else {
		expiryTime := time.Now().AddDate(0, 0, -settings.ExpiryDays)
		err = db.QueryRow("SELECT COUNT(*) FROM cache_entries WHERE created_at < ?", expiryTime).Scan(&stats.ExpiredFiles)
		if err != nil {
			logger.Warn("Failed to get expired files count", zap.Error(err))
		}
	}

	return stats, nil
}

// CleanupExpiredEntries removes expired cache files
func CleanupExpiredEntries() error {
	db := localdb.GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	settings, err := GetCacheSettings()
	if err != nil {
		return fmt.Errorf("failed to get cache settings: %w", err)
	}

	if !settings.CleanupEnabled {
		logger.Debug("Cache cleanup is disabled")
		return nil
	}

	expiryTime := time.Now().AddDate(0, 0, -settings.ExpiryDays)

	// Get expired entries
	rows, err := db.Query("SELECT file_path FROM cache_entries WHERE created_at < ?", expiryTime)
	if err != nil {
		return fmt.Errorf("failed to query expired entries: %w", err)
	}
	defer rows.Close()

	var filesToDelete []string
	for rows.Next() {
		var filePath string
		if err := rows.Scan(&filePath); err != nil {
			logger.Warn("Failed to scan file path", zap.Error(err))
			continue
		}
		filesToDelete = append(filesToDelete, filePath)
	}

	// Delete files and database entries
	deletedCount := 0
	for _, filePath := range filesToDelete {
		if err := os.Remove(filePath); err != nil {
			logger.Warn("Failed to delete cache file", zap.String("path", filePath), zap.Error(err))
		} else {
			deletedCount++
		}
	}

	// Remove database entries
	result, err := db.Exec("DELETE FROM cache_entries WHERE created_at < ?", expiryTime)
	if err != nil {
		return fmt.Errorf("failed to delete expired database entries: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	logger.Info("Cleaned up expired cache entries",
		zap.Int("files_deleted", deletedCount),
		zap.Int64("db_entries_deleted", rowsAffected))

	return nil
}

// ClearAllCache removes all cache files and database entries
func ClearAllCache() error {
	db := localdb.GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	// Get all cache entries
	rows, err := db.Query("SELECT file_path FROM cache_entries")
	if err != nil {
		return fmt.Errorf("failed to query cache entries: %w", err)
	}
	defer rows.Close()

	var filesToDelete []string
	for rows.Next() {
		var filePath string
		if err := rows.Scan(&filePath); err != nil {
			logger.Warn("Failed to scan file path", zap.Error(err))
			continue
		}
		filesToDelete = append(filesToDelete, filePath)
	}

	// Delete all files
	deletedCount := 0
	for _, filePath := range filesToDelete {
		if err := os.Remove(filePath); err != nil {
			logger.Warn("Failed to delete cache file", zap.String("path", filePath), zap.Error(err))
		} else {
			deletedCount++
		}
	}

	// Clear database entries
	result, err := db.Exec("DELETE FROM cache_entries")
	if err != nil {
		return fmt.Errorf("failed to clear cache entries: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	logger.Info("Cleared all cache",
		zap.Int("files_deleted", deletedCount),
		zap.Int64("db_entries_deleted", rowsAffected))

	return nil
}

// CleanupOversizeCache removes oldest files when cache size exceeds limit
func CleanupOversizeCache() error {
	db := localdb.GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	settings, err := GetCacheSettings()
	if err != nil {
		return fmt.Errorf("failed to get cache settings: %w", err)
	}

	stats, err := GetCacheStats()
	if err != nil {
		return fmt.Errorf("failed to get cache stats: %w", err)
	}

	maxSizeBytes := int64(settings.MaxSizeMB) * 1024 * 1024
	currentSizeBytes := int64(stats.TotalSizeMB * 1024 * 1024)

	if currentSizeBytes <= maxSizeBytes {
		return nil // No cleanup needed
	}

	logger.Info("Cache size exceeds limit, cleaning up oldest files",
		zap.Float64("current_size_mb", stats.TotalSizeMB),
		zap.Int("max_size_mb", settings.MaxSizeMB))

	// Get oldest files until we're under the limit
	targetSizeBytes := maxSizeBytes * 80 / 100 // Clean to 80% of limit
	bytesToDelete := currentSizeBytes - targetSizeBytes

	rows, err := db.Query(`SELECT id, file_path, file_size FROM cache_entries
		ORDER BY last_accessed_at ASC`)
	if err != nil {
		return fmt.Errorf("failed to query cache entries for cleanup: %w", err)
	}
	defer rows.Close()

	var filesToDelete []struct {
		id       int64
		path     string
		size     int64
	}
	var deletedBytes int64

	for rows.Next() && deletedBytes < bytesToDelete {
		var id, size int64
		var path string
		if err := rows.Scan(&id, &path, &size); err != nil {
			logger.Warn("Failed to scan cache entry for cleanup", zap.Error(err))
			continue
		}
		filesToDelete = append(filesToDelete, struct {
			id   int64
			path string
			size int64
		}{id, path, size})
		deletedBytes += size
	}

	// Delete files and database entries
	deletedCount := 0
	for _, file := range filesToDelete {
		if err := os.Remove(file.path); err != nil {
			logger.Warn("Failed to delete cache file", zap.String("path", file.path), zap.Error(err))
		} else {
			deletedCount++
		}

		// Remove from database
		_, err := db.Exec("DELETE FROM cache_entries WHERE id = ?", file.id)
		if err != nil {
			logger.Warn("Failed to delete cache entry from database", zap.Int64("id", file.id), zap.Error(err))
		}
	}

	logger.Info("Cleaned up oversized cache",
		zap.Int("files_deleted", deletedCount),
		zap.Int64("bytes_freed", deletedBytes))

	return nil
}

// GetCacheDir returns the cache directory path
func GetCacheDir() (string, error) {
	// Step 1: Get user home directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		logger.Error("Failed to get user home directory", zap.Error(err))
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	logger.Debug("User home directory obtained", zap.String("home_dir", homeDir))

	// Step 2: Build cache directory path
	parentDir := filepath.Join(homeDir, ".twitch-overlay")
	cacheDir := filepath.Join(parentDir, "cache")
	logger.Debug("Cache directory path constructed", zap.String("cache_dir", cacheDir))

	// Step 3: Check if parent directory exists and create if needed
	if _, err := os.Stat(parentDir); os.IsNotExist(err) {
		logger.Debug("Parent directory does not exist, creating", zap.String("parent_dir", parentDir))
		if err := os.MkdirAll(parentDir, 0755); err != nil {
			logger.Error("Failed to create parent directory",
				zap.String("parent_dir", parentDir),
				zap.Error(err))
			return "", fmt.Errorf("failed to create parent directory %s: %w", parentDir, err)
		}
		logger.Debug("Parent directory created successfully", zap.String("parent_dir", parentDir))
	}

	// Step 4: Create cache directory
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		logger.Error("Failed to create cache directory",
			zap.String("cache_dir", cacheDir),
			zap.Error(err))
		return "", fmt.Errorf("failed to create cache directory %s: %w", cacheDir, err)
	}

	// Step 5: Test write permissions
	testFile := filepath.Join(cacheDir, ".write_test")
	if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
		logger.Error("Cache directory is not writable",
			zap.String("cache_dir", cacheDir),
			zap.Error(err))
		return "", fmt.Errorf("cache directory %s is not writable: %w", cacheDir, err)
	}

	// Clean up test file
	if err := os.Remove(testFile); err != nil {
		logger.Warn("Failed to remove test file",
			zap.String("test_file", testFile),
			zap.Error(err))
		// Don't fail for cleanup issues
	}

	logger.Debug("Cache directory verified and accessible", zap.String("cache_dir", cacheDir))
	return cacheDir, nil
}

// InitializeCache performs initial cache setup and cleanup
func InitializeCache() error {
	logger.Info("Initializing cache system")

	// Step 1: Verify cache directory access
	logger.Debug("Checking cache directory access")
	cacheDir, err := GetCacheDir()
	if err != nil {
		logger.Error("Failed to get/create cache directory", zap.Error(err))
		return fmt.Errorf("failed to get cache directory: %w", err)
	}
	logger.Debug("Cache directory verified", zap.String("path", cacheDir))

	// Step 2: Check database connectivity
	logger.Debug("Checking database connectivity")
	db := localdb.GetDB()
	if db == nil {
		logger.Error("Database not initialized - cache system will be disabled")
		return fmt.Errorf("database not initialized")
	}

	// Test database connectivity
	if err := db.Ping(); err != nil {
		logger.Error("Database ping failed", zap.Error(err))
		return fmt.Errorf("database connection failed: %w", err)
	}
	logger.Debug("Database connectivity verified")

	// Step 3: Get cache settings with fallback to defaults
	logger.Debug("Loading cache settings")
	settings, err := GetCacheSettings()
	if err != nil {
		logger.Error("Failed to get cache settings, using defaults", zap.Error(err))
		// Use default settings instead of failing completely
		settings = &CacheSettings{
			ExpiryDays:      7,
			MaxSizeMB:       100,
			CleanupEnabled:  true,
			CleanupOnStart:  true,
		}
		logger.Info("Using default cache settings",
			zap.Int("expiry_days", settings.ExpiryDays),
			zap.Int("max_size_mb", settings.MaxSizeMB))
	} else {
		logger.Debug("Cache settings loaded successfully",
			zap.Int("expiry_days", settings.ExpiryDays),
			zap.Int("max_size_mb", settings.MaxSizeMB),
			zap.Bool("cleanup_enabled", settings.CleanupEnabled),
			zap.Bool("cleanup_on_start", settings.CleanupOnStart))
	}

	// Step 4: Perform startup cleanup if enabled
	if settings.CleanupOnStart {
		logger.Info("Running startup cache cleanup")

		logger.Debug("Cleaning up expired entries")
		if err := CleanupExpiredEntries(); err != nil {
			logger.Warn("Failed to cleanup expired entries on startup", zap.Error(err))
			// Don't fail initialization for cleanup errors
		} else {
			logger.Debug("Expired entries cleanup completed")
		}

		logger.Debug("Cleaning up oversized cache")
		if err := CleanupOversizeCache(); err != nil {
			logger.Warn("Failed to cleanup oversized cache on startup", zap.Error(err))
			// Don't fail initialization for cleanup errors
		} else {
			logger.Debug("Oversized cache cleanup completed")
		}
	} else {
		logger.Debug("Startup cleanup disabled in settings")
	}

	// Step 5: Get cache statistics for logging
	logger.Debug("Getting cache statistics")
	stats, err := GetCacheStats()
	if err != nil {
		logger.Warn("Failed to get cache stats during initialization", zap.Error(err))
		logger.Info("Cache system initialized (stats unavailable)")
	} else {
		logger.Info("Cache system initialized successfully",
			zap.Int("total_files", stats.TotalFiles),
			zap.Float64("total_size_mb", stats.TotalSizeMB),
			zap.Int("expired_files", stats.ExpiredFiles),
			zap.String("cache_dir", cacheDir))
	}

	return nil
}