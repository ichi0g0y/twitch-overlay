package webserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/nantokaworks/twitch-overlay/internal/env"
	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/twitchtoken"
	"go.uber.org/zap"
)

// fetchRewardTitles fetches reward titles from Twitch API and creates a map
func fetchRewardTitles() (map[string]string, error) {
	// Get current token
	token, valid, err := twitchtoken.GetLatestToken()
	if err != nil || !valid {
		return nil, fmt.Errorf("failed to get valid token: %w", err)
	}

	// Get broadcaster ID from environment
	broadcasterID := env.Value.TwitchUserID
	if broadcasterID == nil || *broadcasterID == "" {
		return nil, fmt.Errorf("TWITCH_USER_ID not configured")
	}

	// Call Twitch API to get custom rewards
	url := fmt.Sprintf("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=%s", *broadcasterID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	req.Header.Set("Client-Id", *env.Value.ClientID)

	// Make request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch custom rewards: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("twitch API returned status %d", resp.StatusCode)
	}

	// Parse response
	var rewardsResp TwitchCustomRewardsResponse
	if err := json.NewDecoder(resp.Body).Decode(&rewardsResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Create map of reward ID to title
	titleMap := make(map[string]string)
	for _, reward := range rewardsResp.Data {
		titleMap[reward.ID] = reward.Title
	}

	return titleMap, nil
}

// enrichRewardCountsWithTitles adds reward titles to counts
func enrichRewardCountsWithTitles(counts []localdb.RewardCount) []localdb.RewardCount {
	titleMap, err := fetchRewardTitles()
	if err != nil {
		logger.Error("Failed to fetch reward titles", zap.Error(err))
		// Return counts without titles rather than failing
		return counts
	}

	for i := range counts {
		if title, ok := titleMap[counts[i].RewardID]; ok {
			counts[i].Title = title
		}
	}

	return counts
}

// handleGetAllRewardCounts returns all reward counts
func handleGetAllRewardCounts(w http.ResponseWriter, r *http.Request) {
	counts, err := localdb.GetAllRewardCounts()
	if err != nil {
		logger.Error("Failed to get all reward counts", zap.Error(err))
		http.Error(w, "Failed to get reward counts", http.StatusInternalServerError)
		return
	}

	// Enrich with reward titles
	counts = enrichRewardCountsWithTitles(counts)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(counts)
}

// handleGetGroupRewardCounts returns reward counts for a specific group
func handleGetGroupRewardCounts(w http.ResponseWriter, r *http.Request) {
	// Extract group ID from URL: /api/twitch/reward-groups/{id}/counts
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/twitch/reward-groups/"), "/")
	if len(parts) < 1 {
		http.Error(w, "Invalid URL", http.StatusBadRequest)
		return
	}

	groupID, err := strconv.Atoi(parts[0])
	if err != nil {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	counts, err := localdb.GetGroupRewardCounts(groupID)
	if err != nil {
		logger.Error("Failed to get group reward counts", zap.Error(err), zap.Int("group_id", groupID))
		http.Error(w, "Failed to get group reward counts", http.StatusInternalServerError)
		return
	}

	// Enrich with reward titles
	counts = enrichRewardCountsWithTitles(counts)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(counts)
}

// handleResetAllRewardCounts resets all reward counts to 0
func handleResetAllRewardCounts(w http.ResponseWriter, r *http.Request) {
	if err := localdb.ResetAllRewardCounts(); err != nil {
		logger.Error("Failed to reset all reward counts", zap.Error(err))
		http.Error(w, "Failed to reset reward counts", http.StatusInternalServerError)
		return
	}

	// WebSocketで全クライアントに通知
	BroadcastWSMessage("reward_counts_reset", nil)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleResetRewardCount resets a specific reward count to 0
func handleResetRewardCount(w http.ResponseWriter, r *http.Request) {
	// Extract reward ID from URL: /api/twitch/reward-counts/{id}/reset
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/twitch/reward-counts/"), "/")
	if len(parts) < 1 {
		http.Error(w, "Invalid URL", http.StatusBadRequest)
		return
	}
	rewardID := parts[0]

	if err := localdb.ResetRewardCount(rewardID); err != nil {
		logger.Error("Failed to reset reward count", zap.Error(err), zap.String("reward_id", rewardID))
		http.Error(w, "Failed to reset reward count", http.StatusInternalServerError)
		return
	}

	// カウント更新をWebSocketで通知
	count, err := localdb.GetRewardCount(rewardID)
	if err == nil {
		// リワードタイトルを取得して追加
		titleMap, err := fetchRewardTitles()
		if err == nil {
			if title, ok := titleMap[rewardID]; ok {
				count.Title = title
			}
		}
		BroadcastWSMessage("reward_count_updated", count)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// SetRewardDisplayNameRequest is the request body for setting reward display name
type SetRewardDisplayNameRequest struct {
	DisplayName string `json:"display_name"`
}

// handleSetRewardDisplayName sets the display name for a reward
func handleSetRewardDisplayName(w http.ResponseWriter, r *http.Request) {
	// Extract reward ID from URL: /api/twitch/rewards/{id}/display-name
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/twitch/rewards/"), "/")
	if len(parts) < 1 {
		http.Error(w, "Invalid URL", http.StatusBadRequest)
		return
	}
	rewardID := parts[0]

	var req SetRewardDisplayNameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := localdb.SetRewardDisplayName(rewardID, req.DisplayName); err != nil {
		logger.Error("Failed to set reward display name", zap.Error(err), zap.String("reward_id", rewardID))
		http.Error(w, "Failed to set reward display name", http.StatusInternalServerError)
		return
	}

	// 表示名更新をWebSocketで通知
	count, err := localdb.GetRewardCount(rewardID)
	if err == nil {
		// リワードタイトルを取得して追加
		titleMap, err := fetchRewardTitles()
		if err == nil {
			if title, ok := titleMap[rewardID]; ok {
				count.Title = title
			}
		}
		BroadcastWSMessage("reward_count_updated", count)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}
