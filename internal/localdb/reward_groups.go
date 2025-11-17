package localdb

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// RewardGroup represents a group of custom rewards
type RewardGroup struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	IsEnabled bool      `json:"is_enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// RewardGroupMember represents a relationship between a group and a reward
type RewardGroupMember struct {
	ID        int       `json:"id"`
	GroupID   int       `json:"group_id"`
	RewardID  string    `json:"reward_id"`
	CreatedAt time.Time `json:"created_at"`
}

// RewardGroupWithRewards represents a group with its associated reward IDs
type RewardGroupWithRewards struct {
	RewardGroup
	RewardIDs []string `json:"reward_ids"`
}

// CreateRewardGroup creates a new reward group
func CreateRewardGroup(name string) (*RewardGroup, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	result, err := db.Exec(
		`INSERT INTO reward_groups (name, is_enabled, created_at, updated_at)
		VALUES (?, ?, ?, ?)`,
		name, true, time.Now(), time.Now(),
	)
	if err != nil {
		logger.Error("Failed to create reward group", zap.Error(err), zap.String("name", name))
		return nil, fmt.Errorf("failed to create reward group: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get last insert id: %w", err)
	}

	group := &RewardGroup{
		ID:        int(id),
		Name:      name,
		IsEnabled: true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	logger.Info("Created reward group", zap.Int("id", group.ID), zap.String("name", name))
	return group, nil
}

// GetRewardGroups returns all reward groups
func GetRewardGroups() ([]RewardGroup, error) {
	db := GetDB()
	if db == nil {
		return []RewardGroup{}, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(`SELECT id, name, is_enabled, created_at, updated_at FROM reward_groups ORDER BY created_at DESC`)
	if err != nil {
		logger.Error("Failed to get reward groups", zap.Error(err))
		return []RewardGroup{}, fmt.Errorf("failed to get reward groups: %w", err)
	}
	defer rows.Close()

	// Initialize with empty slice to avoid nil
	groups := []RewardGroup{}
	for rows.Next() {
		var group RewardGroup
		err := rows.Scan(&group.ID, &group.Name, &group.IsEnabled, &group.CreatedAt, &group.UpdatedAt)
		if err != nil {
			logger.Error("Failed to scan reward group", zap.Error(err))
			continue
		}
		groups = append(groups, group)
	}

	return groups, nil
}

// GetRewardGroupsWithRewards returns all reward groups with their associated reward IDs
func GetRewardGroupsWithRewards() ([]RewardGroupWithRewards, error) {
	groups, err := GetRewardGroups()
	if err != nil {
		return []RewardGroupWithRewards{}, err
	}

	// Initialize with empty slice to avoid nil
	groupsWithRewards := []RewardGroupWithRewards{}
	for _, group := range groups {
		rewardIDs, err := GetGroupRewards(group.ID)
		if err != nil {
			logger.Error("Failed to get group rewards", zap.Error(err), zap.Int("group_id", group.ID))
			// Use empty slice on error
			rewardIDs = []string{}
		}

		groupsWithRewards = append(groupsWithRewards, RewardGroupWithRewards{
			RewardGroup: group,
			RewardIDs:   rewardIDs,
		})
	}

	return groupsWithRewards, nil
}

// GetRewardGroup returns a single reward group by ID
func GetRewardGroup(id int) (*RewardGroup, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var group RewardGroup
	err := db.QueryRow(
		`SELECT id, name, is_enabled, created_at, updated_at FROM reward_groups WHERE id = ?`,
		id,
	).Scan(&group.ID, &group.Name, &group.IsEnabled, &group.CreatedAt, &group.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("reward group not found")
	}
	if err != nil {
		logger.Error("Failed to get reward group", zap.Error(err), zap.Int("id", id))
		return nil, fmt.Errorf("failed to get reward group: %w", err)
	}

	return &group, nil
}

// UpdateRewardGroup updates a reward group's name
func UpdateRewardGroup(id int, name string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(
		`UPDATE reward_groups SET name = ?, updated_at = ? WHERE id = ?`,
		name, time.Now(), id,
	)
	if err != nil {
		logger.Error("Failed to update reward group", zap.Error(err), zap.Int("id", id), zap.String("name", name))
		return fmt.Errorf("failed to update reward group: %w", err)
	}

	logger.Info("Updated reward group", zap.Int("id", id), zap.String("name", name))
	return nil
}

// UpdateRewardGroupEnabled updates a reward group's enabled status
func UpdateRewardGroupEnabled(id int, enabled bool) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(
		`UPDATE reward_groups SET is_enabled = ?, updated_at = ? WHERE id = ?`,
		enabled, time.Now(), id,
	)
	if err != nil {
		logger.Error("Failed to update reward group enabled status", zap.Error(err), zap.Int("id", id), zap.Bool("enabled", enabled))
		return fmt.Errorf("failed to update reward group enabled status: %w", err)
	}

	logger.Info("Updated reward group enabled status", zap.Int("id", id), zap.Bool("enabled", enabled))
	return nil
}

// DeleteRewardGroup deletes a reward group (cascades to members)
func DeleteRewardGroup(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(`DELETE FROM reward_groups WHERE id = ?`, id)
	if err != nil {
		logger.Error("Failed to delete reward group", zap.Error(err), zap.Int("id", id))
		return fmt.Errorf("failed to delete reward group: %w", err)
	}

	logger.Info("Deleted reward group", zap.Int("id", id))
	return nil
}

// AddRewardToGroup adds a reward to a group
func AddRewardToGroup(groupID int, rewardID string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(
		`INSERT INTO reward_group_members (group_id, reward_id, created_at) VALUES (?, ?, ?)`,
		groupID, rewardID, time.Now(),
	)
	if err != nil {
		logger.Error("Failed to add reward to group", zap.Error(err), zap.Int("group_id", groupID), zap.String("reward_id", rewardID))
		return fmt.Errorf("failed to add reward to group: %w", err)
	}

	logger.Info("Added reward to group", zap.Int("group_id", groupID), zap.String("reward_id", rewardID))
	return nil
}

// RemoveRewardFromGroup removes a reward from a group
func RemoveRewardFromGroup(groupID int, rewardID string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(
		`DELETE FROM reward_group_members WHERE group_id = ? AND reward_id = ?`,
		groupID, rewardID,
	)
	if err != nil {
		logger.Error("Failed to remove reward from group", zap.Error(err), zap.Int("group_id", groupID), zap.String("reward_id", rewardID))
		return fmt.Errorf("failed to remove reward from group: %w", err)
	}

	logger.Info("Removed reward from group", zap.Int("group_id", groupID), zap.String("reward_id", rewardID))
	return nil
}

// GetGroupRewards returns all reward IDs in a group
func GetGroupRewards(groupID int) ([]string, error) {
	db := GetDB()
	if db == nil {
		return []string{}, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(
		`SELECT reward_id FROM reward_group_members WHERE group_id = ? ORDER BY created_at`,
		groupID,
	)
	if err != nil {
		logger.Error("Failed to get group rewards", zap.Error(err), zap.Int("group_id", groupID))
		return []string{}, fmt.Errorf("failed to get group rewards: %w", err)
	}
	defer rows.Close()

	// Initialize with empty slice to avoid nil
	rewardIDs := []string{}
	for rows.Next() {
		var rewardID string
		if err := rows.Scan(&rewardID); err != nil {
			logger.Error("Failed to scan reward ID", zap.Error(err))
			continue
		}
		rewardIDs = append(rewardIDs, rewardID)
	}

	return rewardIDs, nil
}

// GetRewardGroups returns all groups that a reward belongs to
func GetRewardGroupsByRewardID(rewardID string) ([]RewardGroup, error) {
	db := GetDB()
	if db == nil {
		return []RewardGroup{}, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(`
		SELECT rg.id, rg.name, rg.is_enabled, rg.created_at, rg.updated_at
		FROM reward_groups rg
		INNER JOIN reward_group_members rgm ON rg.id = rgm.group_id
		WHERE rgm.reward_id = ?
		ORDER BY rg.created_at DESC
	`, rewardID)
	if err != nil {
		logger.Error("Failed to get reward groups by reward ID", zap.Error(err), zap.String("reward_id", rewardID))
		return []RewardGroup{}, fmt.Errorf("failed to get reward groups by reward ID: %w", err)
	}
	defer rows.Close()

	// Initialize with empty slice to avoid nil
	groups := []RewardGroup{}
	for rows.Next() {
		var group RewardGroup
		err := rows.Scan(&group.ID, &group.Name, &group.IsEnabled, &group.CreatedAt, &group.UpdatedAt)
		if err != nil {
			logger.Error("Failed to scan reward group", zap.Error(err))
			continue
		}
		groups = append(groups, group)
	}

	return groups, nil
}
