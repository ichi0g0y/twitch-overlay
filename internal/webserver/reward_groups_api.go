package webserver

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchtoken"
	"go.uber.org/zap"
)

// handleRewardGroups handles GET and POST for reward groups list
func handleRewardGroups(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleGetRewardGroups(w, r)
	case http.MethodPost:
		handleCreateRewardGroup(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleGetRewardGroups returns all reward groups with their members
func handleGetRewardGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := localdb.GetRewardGroupsWithRewards()
	if err != nil {
		logger.Error("Failed to get reward groups", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "グループの取得に失敗しました",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": groups,
	})
}

// handleCreateRewardGroup creates a new reward group
func handleCreateRewardGroup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Group name is required", http.StatusBadRequest)
		return
	}

	group, err := localdb.CreateRewardGroup(req.Name)
	if err != nil {
		logger.Error("Failed to create reward group", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "グループの作成に失敗しました",
		})
		return
	}

	// Return group with empty reward_ids array
	groupWithRewards := localdb.RewardGroupWithRewards{
		RewardGroup: *group,
		RewardIDs:   []string{},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(groupWithRewards)
}

// handleRewardGroupByID handles GET, PUT, DELETE for specific reward group
func handleRewardGroupByID(w http.ResponseWriter, r *http.Request) {
	// Extract group ID from path: /api/twitch/reward-groups/{id}
	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/twitch/reward-groups/"), "/")
	if len(pathParts) == 0 || pathParts[0] == "" {
		http.Error(w, "Group ID required", http.StatusBadRequest)
		return
	}

	groupID, err := strconv.Atoi(pathParts[0])
	if err != nil {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		handleGetRewardGroup(w, r, groupID)
	case http.MethodPut:
		handleUpdateRewardGroup(w, r, groupID)
	case http.MethodDelete:
		handleDeleteRewardGroup(w, r, groupID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleGetRewardGroup returns a single reward group with its members
func handleGetRewardGroup(w http.ResponseWriter, r *http.Request, groupID int) {
	group, err := localdb.GetRewardGroup(groupID)
	if err != nil {
		logger.Error("Failed to get reward group", zap.Error(err), zap.Int("group_id", groupID))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "グループが見つかりません",
		})
		return
	}

	rewardIDs, err := localdb.GetGroupRewards(groupID)
	if err != nil {
		logger.Error("Failed to get group rewards", zap.Error(err), zap.Int("group_id", groupID))
		rewardIDs = []string{}
	}

	groupWithRewards := localdb.RewardGroupWithRewards{
		RewardGroup: *group,
		RewardIDs:   rewardIDs,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groupWithRewards)
}

// handleUpdateRewardGroup updates a reward group's name
func handleUpdateRewardGroup(w http.ResponseWriter, r *http.Request, groupID int) {
	var req struct {
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Group name is required", http.StatusBadRequest)
		return
	}

	err := localdb.UpdateRewardGroup(groupID, req.Name)
	if err != nil {
		logger.Error("Failed to update reward group", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "グループの更新に失敗しました",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "グループを更新しました",
	})
}

// handleDeleteRewardGroup deletes a reward group
func handleDeleteRewardGroup(w http.ResponseWriter, r *http.Request, groupID int) {
	err := localdb.DeleteRewardGroup(groupID)
	if err != nil {
		logger.Error("Failed to delete reward group", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "グループの削除に失敗しました",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "グループを削除しました",
	})
}

// handleRewardGroupMembers handles POST and DELETE for reward group members
func handleRewardGroupMembers(w http.ResponseWriter, r *http.Request) {
	// Extract group ID from path: /api/twitch/reward-groups/{id}/rewards[/{rewardId}]
	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/twitch/reward-groups/"), "/")
	if len(pathParts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	groupID, err := strconv.Atoi(pathParts[0])
	if err != nil {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodPost:
		handleAddRewardToGroup(w, r, groupID)
	case http.MethodDelete:
		if len(pathParts) < 3 {
			http.Error(w, "Reward ID required", http.StatusBadRequest)
			return
		}
		rewardID := pathParts[2]
		handleRemoveRewardFromGroup(w, r, groupID, rewardID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAddRewardToGroup adds a reward to a group
func handleAddRewardToGroup(w http.ResponseWriter, r *http.Request, groupID int) {
	var req struct {
		RewardID string `json:"reward_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.RewardID == "" {
		http.Error(w, "Reward ID is required", http.StatusBadRequest)
		return
	}

	err := localdb.AddRewardToGroup(groupID, req.RewardID)
	if err != nil {
		logger.Error("Failed to add reward to group", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リワードの追加に失敗しました",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "リワードをグループに追加しました",
	})
}

// handleRemoveRewardFromGroup removes a reward from a group
func handleRemoveRewardFromGroup(w http.ResponseWriter, r *http.Request, groupID int, rewardID string) {
	err := localdb.RemoveRewardFromGroup(groupID, rewardID)
	if err != nil {
		logger.Error("Failed to remove reward from group", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リワードの削除に失敗しました",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "リワードをグループから削除しました",
	})
}

// handleToggleRewardGroup toggles all rewards in a group on/off via Twitch API
func handleToggleRewardGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract group ID from path: /api/twitch/reward-groups/{id}/toggle
	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/twitch/reward-groups/"), "/")
	if len(pathParts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	groupID, err := strconv.Atoi(pathParts[0])
	if err != nil {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get group information
	group, err := localdb.GetRewardGroup(groupID)
	if err != nil {
		logger.Error("Failed to get reward group", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "グループが見つかりません",
		})
		return
	}

	// Get all reward IDs in the group
	rewardIDs, err := localdb.GetGroupRewards(groupID)
	if err != nil {
		logger.Error("Failed to get group rewards", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "グループのリワード取得に失敗しました",
		})
		return
	}

	// Get Twitch token and broadcaster ID
	token, valid, err := twitchtoken.GetLatestToken()
	if err != nil || !valid {
		logger.Error("Failed to get valid token", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Twitch認証が必要です",
		})
		return
	}

	broadcasterID := env.Value.TwitchUserID
	if broadcasterID == nil || *broadcasterID == "" {
		logger.Error("TWITCH_USER_ID not configured")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "TWITCH_USER_IDが設定されていません",
		})
		return
	}

	// Update each reward via Twitch API
	successCount := 0
	failedRewards := []string{}

	for _, rewardID := range rewardIDs {
		logger.Info("Updating reward via Twitch API",
			zap.String("broadcaster_id", *broadcasterID),
			zap.String("reward_id", rewardID),
			zap.Bool("enabled", req.Enabled))

		err := updateTwitchRewardEnabled(*broadcasterID, rewardID, req.Enabled, token.AccessToken)
		if err != nil {
			logger.Error("Failed to update reward via Twitch API",
				zap.Error(err),
				zap.String("reward_id", rewardID),
				zap.Bool("enabled", req.Enabled))
			failedRewards = append(failedRewards, rewardID)
		} else {
			successCount++
		}
	}

	// Update group enabled status in database
	if err := localdb.UpdateRewardGroupEnabled(groupID, req.Enabled); err != nil {
		logger.Error("Failed to update group enabled status", zap.Error(err))
	}

	// Return response
	w.Header().Set("Content-Type", "application/json")
	if len(failedRewards) > 0 {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":        false,
			"message":        fmt.Sprintf("一部のリワードの更新に失敗しました (%d/%d成功)", successCount, len(rewardIDs)),
			"success_count":  successCount,
			"failed_count":   len(failedRewards),
			"failed_rewards": failedRewards,
		})
	} else {
		logger.Info("Successfully toggled reward group",
			zap.Int("group_id", groupID),
			zap.String("group_name", group.Name),
			zap.Bool("enabled", req.Enabled),
			zap.Int("reward_count", len(rewardIDs)))

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": fmt.Sprintf("グループ「%s」の%d個のリワードを%sにしました", group.Name, len(rewardIDs), enabledText(req.Enabled)),
		})
	}
}

// updateTwitchRewardEnabled updates a reward's enabled status via Twitch API
func updateTwitchRewardEnabled(broadcasterID, rewardID string, enabled bool, accessToken string) error {
	url := fmt.Sprintf("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=%s&id=%s",
		broadcasterID, rewardID)

	// Create request body
	body := map[string]interface{}{
		"is_enabled": enabled,
	}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request body: %w", err)
	}

	logger.Debug("Twitch API request",
		zap.String("url", url),
		zap.String("body", string(bodyJSON)),
		zap.String("client_id", *env.Value.ClientID))

	// Create PATCH request
	req, err := http.NewRequest("PATCH", url, strings.NewReader(string(bodyJSON)))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Client-Id", *env.Value.ClientID)
	req.Header.Set("Content-Type", "application/json")

	// Make request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	// Check response
	if resp.StatusCode != http.StatusOK {
		// Read response body for error details
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("twitch API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

// enabledText returns Japanese text for enabled/disabled status
func enabledText(enabled bool) string {
	if enabled {
		return "有効"
	}
	return "無効"
}

// handleGetRewardGroupsByRewardID returns all groups that a reward belongs to
func handleGetRewardGroupsByRewardID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get reward ID from query parameter
	rewardID := r.URL.Query().Get("reward_id")
	if rewardID == "" {
		http.Error(w, "reward_id parameter required", http.StatusBadRequest)
		return
	}

	groups, err := localdb.GetRewardGroupsByRewardID(rewardID)
	if err != nil {
		logger.Error("Failed to get reward groups by reward ID", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "グループの取得に失敗しました",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": groups,
	})
}
