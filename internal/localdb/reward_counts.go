package localdb

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// RewardCount represents the redemption count for a reward
type RewardCount struct {
	RewardID    string    `json:"reward_id"`
	Count       int       `json:"count"`
	DisplayName string    `json:"display_name"` // 表示用文字列（未設定の場合は空文字列）
	Title       string    `json:"title"`        // リワードの実際の名前（Twitch API由来）
	LastResetAt time.Time `json:"last_reset_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// SetupRewardCountsTable creates the reward_redemption_counts table
func SetupRewardCountsTable(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS reward_redemption_counts (
		reward_id TEXT PRIMARY KEY,
		count INTEGER NOT NULL DEFAULT 0,
		display_name TEXT DEFAULT '',
		is_enabled BOOLEAN DEFAULT NULL,
		last_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		logger.Error("Failed to create reward_redemption_counts table", zap.Error(err))
		return fmt.Errorf("failed to create reward_redemption_counts table: %w", err)
	}

	// 既存のテーブルに is_enabled カラムを追加（既に存在する場合はエラーを無視）
	db.Exec(`ALTER TABLE reward_redemption_counts ADD COLUMN is_enabled BOOLEAN DEFAULT NULL`)

	return nil
}

// GetRewardCount returns the current count for a reward
func GetRewardCount(rewardID string) (*RewardCount, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var count RewardCount
	err := db.QueryRow(
		`SELECT reward_id, count, display_name, last_reset_at, updated_at
		FROM reward_redemption_counts WHERE reward_id = ?`,
		rewardID,
	).Scan(&count.RewardID, &count.Count, &count.DisplayName, &count.LastResetAt, &count.UpdatedAt)

	if err == sql.ErrNoRows {
		// レコードが存在しない場合は0を返す
		return &RewardCount{
			RewardID:    rewardID,
			Count:       0,
			DisplayName: "",
			LastResetAt: time.Now(),
			UpdatedAt:   time.Now(),
		}, nil
	}
	if err != nil {
		logger.Error("Failed to get reward count", zap.Error(err), zap.String("reward_id", rewardID))
		return nil, fmt.Errorf("failed to get reward count: %w", err)
	}

	return &count, nil
}

// GetAllRewardCounts returns all reward counts
func GetAllRewardCounts() ([]RewardCount, error) {
	db := GetDB()
	if db == nil {
		return []RewardCount{}, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(
		`SELECT reward_id, count, display_name, last_reset_at, updated_at
		FROM reward_redemption_counts ORDER BY updated_at DESC`,
	)
	if err != nil {
		logger.Error("Failed to get all reward counts", zap.Error(err))
		return []RewardCount{}, fmt.Errorf("failed to get all reward counts: %w", err)
	}
	defer rows.Close()

	counts := []RewardCount{}
	for rows.Next() {
		var count RewardCount
		err := rows.Scan(&count.RewardID, &count.Count, &count.DisplayName, &count.LastResetAt, &count.UpdatedAt)
		if err != nil {
			logger.Error("Failed to scan reward count", zap.Error(err))
			continue
		}
		counts = append(counts, count)
	}

	return counts, nil
}

// GetGroupRewardCounts returns all reward counts for rewards in a specific group
func GetGroupRewardCounts(groupID int) ([]RewardCount, error) {
	db := GetDB()
	if db == nil {
		return []RewardCount{}, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(`
		SELECT rc.reward_id, rc.count, rc.display_name, rc.last_reset_at, rc.updated_at
		FROM reward_redemption_counts rc
		INNER JOIN reward_group_members rgm ON rc.reward_id = rgm.reward_id
		WHERE rgm.group_id = ?
		ORDER BY rc.updated_at DESC
	`, groupID)
	if err != nil {
		logger.Error("Failed to get group reward counts", zap.Error(err), zap.Int("group_id", groupID))
		return []RewardCount{}, fmt.Errorf("failed to get group reward counts: %w", err)
	}
	defer rows.Close()

	counts := []RewardCount{}
	for rows.Next() {
		var count RewardCount
		err := rows.Scan(&count.RewardID, &count.Count, &count.DisplayName, &count.LastResetAt, &count.UpdatedAt)
		if err != nil {
			logger.Error("Failed to scan reward count", zap.Error(err))
			continue
		}
		counts = append(counts, count)
	}

	return counts, nil
}

// IncrementRewardCount increments the count for a reward
func IncrementRewardCount(rewardID string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(`
		INSERT INTO reward_redemption_counts (reward_id, count, updated_at)
		VALUES (?, 1, ?)
		ON CONFLICT(reward_id) DO UPDATE SET
			count = count + 1,
			updated_at = ?
	`, rewardID, time.Now(), time.Now())

	if err != nil {
		logger.Error("Failed to increment reward count", zap.Error(err), zap.String("reward_id", rewardID))
		return fmt.Errorf("failed to increment reward count: %w", err)
	}

	logger.Debug("Incremented reward count", zap.String("reward_id", rewardID))
	return nil
}

// ResetRewardCount resets the count for a specific reward to 0
func ResetRewardCount(rewardID string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(`
		UPDATE reward_redemption_counts
		SET count = 0, last_reset_at = ?, updated_at = ?
		WHERE reward_id = ?
	`, time.Now(), time.Now(), rewardID)

	if err != nil {
		logger.Error("Failed to reset reward count", zap.Error(err), zap.String("reward_id", rewardID))
		return fmt.Errorf("failed to reset reward count: %w", err)
	}

	logger.Info("Reset reward count", zap.String("reward_id", rewardID))
	return nil
}

// ResetAllRewardCounts resets all reward counts to 0
func ResetAllRewardCounts() error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(`
		UPDATE reward_redemption_counts
		SET count = 0, last_reset_at = ?, updated_at = ?
	`, time.Now(), time.Now())

	if err != nil {
		logger.Error("Failed to reset all reward counts", zap.Error(err))
		return fmt.Errorf("failed to reset all reward counts: %w", err)
	}

	logger.Info("Reset all reward counts")
	return nil
}

// SetRewardDisplayName sets the display name for a reward
func SetRewardDisplayName(rewardID, displayName string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(`
		INSERT INTO reward_redemption_counts (reward_id, display_name, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(reward_id) DO UPDATE SET
			display_name = ?,
			updated_at = ?
	`, rewardID, displayName, time.Now(), displayName, time.Now())

	if err != nil {
		logger.Error("Failed to set reward display name", zap.Error(err), zap.String("reward_id", rewardID))
		return fmt.Errorf("failed to set reward display name: %w", err)
	}

	logger.Info("Set reward display name", zap.String("reward_id", rewardID), zap.String("display_name", displayName))
	return nil
}

// GetRewardDisplayName gets the display name for a reward
func GetRewardDisplayName(rewardID string) (string, error) {
	db := GetDB()
	if db == nil {
		return "", fmt.Errorf("database not initialized")
	}

	var displayName string
	err := db.QueryRow(
		`SELECT display_name FROM reward_redemption_counts WHERE reward_id = ?`,
		rewardID,
	).Scan(&displayName)

	if err == sql.ErrNoRows {
		return "", nil // 未設定の場合は空文字列を返す
	}
	if err != nil {
		logger.Error("Failed to get reward display name", zap.Error(err), zap.String("reward_id", rewardID))
		return "", fmt.Errorf("failed to get reward display name: %w", err)
	}

	return displayName, nil
}

// SetRewardEnabled sets the enabled status for a reward
func SetRewardEnabled(rewardID string, isEnabled bool) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(`
		INSERT INTO reward_redemption_counts (reward_id, is_enabled, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(reward_id) DO UPDATE SET
			is_enabled = ?,
			updated_at = ?
	`, rewardID, isEnabled, time.Now(), isEnabled, time.Now())

	if err != nil {
		logger.Error("Failed to set reward enabled status", zap.Error(err), zap.String("reward_id", rewardID))
		return fmt.Errorf("failed to set reward enabled status: %w", err)
	}

	logger.Info("Set reward enabled status", zap.String("reward_id", rewardID), zap.Bool("is_enabled", isEnabled))
	return nil
}

// GetRewardEnabled gets the enabled status for a reward (returns nil if not set)
func GetRewardEnabled(rewardID string) (*bool, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var isEnabled sql.NullBool
	err := db.QueryRow(
		`SELECT is_enabled FROM reward_redemption_counts WHERE reward_id = ?`,
		rewardID,
	).Scan(&isEnabled)

	if err == sql.ErrNoRows {
		return nil, nil // レコードが存在しない場合はnilを返す
	}
	if err != nil {
		logger.Error("Failed to get reward enabled status", zap.Error(err), zap.String("reward_id", rewardID))
		return nil, fmt.Errorf("failed to get reward enabled status: %w", err)
	}

	if !isEnabled.Valid {
		return nil, nil // NULLの場合はnilを返す
	}

	result := isEnabled.Bool
	return &result, nil
}
