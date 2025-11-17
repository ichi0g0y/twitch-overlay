package webserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/nantokaworks/twitch-overlay/internal/env"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/twitchtoken"
	"go.uber.org/zap"
)

// TwitchUserInfo represents Twitch user information
type TwitchUserInfo struct {
	ID              string `json:"id"`
	Login           string `json:"login"`
	DisplayName     string `json:"display_name"`
	ProfileImageURL string `json:"profile_image_url,omitempty"`
	Verified        bool   `json:"verified"`
	Error           string `json:"error,omitempty"`
}

// TwitchUsersResponse represents the response from Twitch Users API
type TwitchUsersResponse struct {
	Data []struct {
		ID              string `json:"id"`
		Login           string `json:"login"`
		DisplayName     string `json:"display_name"`
		ProfileImageURL string `json:"profile_image_url"`
	} `json:"data"`
}

// TwitchCustomReward represents a Twitch Custom Reward
type TwitchCustomReward struct {
	ID                                string `json:"id"`
	Title                             string `json:"title"`
	Prompt                            string `json:"prompt"`
	Cost                              int    `json:"cost"`
	IsEnabled                         bool   `json:"is_enabled"`
	BackgroundColor                   string `json:"background_color"`
	IsUserInputRequired               bool   `json:"is_user_input_required"`
	MaxPerStreamSetting               struct {
		IsEnabled    bool `json:"is_enabled"`
		MaxPerStream int  `json:"max_per_stream"`
	} `json:"max_per_stream_setting"`
	MaxPerUserPerStreamSetting        struct {
		IsEnabled           bool `json:"is_enabled"`
		MaxPerUserPerStream int  `json:"max_per_user_per_stream"`
	} `json:"max_per_user_per_stream_setting"`
	GlobalCooldownSetting             struct {
		IsEnabled             bool `json:"is_enabled"`
		GlobalCooldownSeconds int  `json:"global_cooldown_seconds"`
	} `json:"global_cooldown_setting"`
	IsPaused                          bool   `json:"is_paused"`
	IsInStock                         bool   `json:"is_in_stock"`
	ShouldRedemptionsSkipRequestQueue bool   `json:"should_redemptions_skip_request_queue"`
	RedemptionsRedeemedCurrentStream  *int   `json:"redemptions_redeemed_current_stream"`
	CooldownExpiresAt                 string `json:"cooldown_expires_at,omitempty"`
}

// TwitchCustomRewardsResponse represents the response from Twitch Custom Rewards API
type TwitchCustomRewardsResponse struct {
	Data []TwitchCustomReward `json:"data"`
}

// handleTwitchVerify verifies Twitch configuration by fetching user information
func handleTwitchVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	logger.Info("Verifying Twitch configuration")

	// Get current token
	token, valid, err := twitchtoken.GetLatestToken()
	if err != nil || !valid {
		logger.Error("Failed to get valid token", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(TwitchUserInfo{
			Verified: false,
			Error:    "Twitch認証が必要です",
		})
		return
	}

	// Get user ID from environment
	userID := env.Value.TwitchUserID
	if userID == nil || *userID == "" {
		logger.Error("TWITCH_USER_ID not configured")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(TwitchUserInfo{
			Verified: false,
			Error:    "TWITCH_USER_IDが設定されていません",
		})
		return
	}

	// Call Twitch API to get user information
	req, err := http.NewRequest("GET", fmt.Sprintf("https://api.twitch.tv/helix/users?id=%s", *userID), nil)
	if err != nil {
		logger.Error("Failed to create request", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(TwitchUserInfo{
			Verified: false,
			Error:    "リクエストの作成に失敗しました",
		})
		return
	}

	// Set headers
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	req.Header.Set("Client-Id", *env.Value.ClientID)

	// Make request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		logger.Error("Failed to fetch user info", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(TwitchUserInfo{
			Verified: false,
			Error:    "Twitch APIへの接続に失敗しました",
		})
		return
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		logger.Error("Twitch API returned error", zap.Int("status", resp.StatusCode))
		w.Header().Set("Content-Type", "application/json")
		
		errorMessage := "Twitch APIエラー"
		if resp.StatusCode == http.StatusUnauthorized {
			errorMessage = "認証エラー: トークンが無効です"
		} else if resp.StatusCode == http.StatusForbidden {
			errorMessage = "アクセス権限がありません"
		}
		
		json.NewEncoder(w).Encode(TwitchUserInfo{
			Verified: false,
			Error:    errorMessage,
		})
		return
	}

	// Parse response
	var twitchResp TwitchUsersResponse
	if err := json.NewDecoder(resp.Body).Decode(&twitchResp); err != nil {
		logger.Error("Failed to parse response", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(TwitchUserInfo{
			Verified: false,
			Error:    "レスポンスの解析に失敗しました",
		})
		return
	}

	// Check if user data exists
	if len(twitchResp.Data) == 0 {
		logger.Error("User not found", zap.String("user_id", *userID))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(TwitchUserInfo{
			Verified: false,
			Error:    "ユーザーが見つかりません",
		})
		return
	}

	// Return user information
	userData := twitchResp.Data[0]
	logger.Info("Twitch configuration verified successfully", 
		zap.String("login", userData.Login),
		zap.String("display_name", userData.DisplayName))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(TwitchUserInfo{
		ID:              userData.ID,
		Login:           userData.Login,
		DisplayName:     userData.DisplayName,
		ProfileImageURL: userData.ProfileImageURL,
		Verified:        true,
	})
}

// handleTwitchCustomRewards returns the list of custom rewards for the broadcaster
func handleTwitchCustomRewards(w http.ResponseWriter, r *http.Request) {
	// Handle different HTTP methods
	switch r.Method {
	case http.MethodGet:
		handleGetCustomRewards(w, r)
	case http.MethodPatch:
		handlePatchCustomReward(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleGetCustomRewards fetches all custom rewards from Twitch API
func handleGetCustomRewards(w http.ResponseWriter, r *http.Request) {
	logger.Info("Fetching Twitch Custom Rewards")

	// Get current token
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

	// Get broadcaster ID from environment
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

	// Call Twitch API to get custom rewards
	url := fmt.Sprintf("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=%s", *broadcasterID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		logger.Error("Failed to create request", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リクエストの作成に失敗しました",
		})
		return
	}

	// Set headers
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	req.Header.Set("Client-Id", *env.Value.ClientID)

	// Make request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		logger.Error("Failed to fetch custom rewards", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Twitch APIへの接続に失敗しました",
		})
		return
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		logger.Error("Twitch API returned error", zap.Int("status", resp.StatusCode))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)

		errorMessage := "Twitch APIエラー"
		if resp.StatusCode == http.StatusUnauthorized {
			errorMessage = "認証エラー: トークンが無効です"
		} else if resp.StatusCode == http.StatusForbidden {
			errorMessage = "アクセス権限がありません"
		}

		json.NewEncoder(w).Encode(map[string]string{
			"error": errorMessage,
		})
		return
	}

	// Parse response
	var rewardsResp TwitchCustomRewardsResponse
	if err := json.NewDecoder(resp.Body).Decode(&rewardsResp); err != nil {
		logger.Error("Failed to parse response", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "レスポンスの解析に失敗しました",
		})
		return
	}

	// Return custom rewards
	logger.Info("Custom rewards fetched successfully", zap.Int("count", len(rewardsResp.Data)))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rewardsResp)
}

// CreateRewardRequest represents the request body for creating a custom reward
type CreateRewardRequest struct {
	Title                            string `json:"title"`
	Cost                             int    `json:"cost"`
	Prompt                           string `json:"prompt,omitempty"`
	IsEnabled                        bool   `json:"is_enabled"`
	BackgroundColor                  string `json:"background_color,omitempty"`
	IsUserInputRequired              bool   `json:"is_user_input_required"`
	IsMaxPerStreamEnabled            bool   `json:"is_max_per_stream_enabled"`
	MaxPerStream                     int    `json:"max_per_stream,omitempty"`
	IsMaxPerUserPerStreamEnabled     bool   `json:"is_max_per_user_per_stream_enabled"`
	MaxPerUserPerStream              int    `json:"max_per_user_per_stream,omitempty"`
	IsGlobalCooldownEnabled          bool   `json:"is_global_cooldown_enabled"`
	GlobalCooldownSeconds            int    `json:"global_cooldown_seconds,omitempty"`
	ShouldRedemptionsSkipRequestQueue bool  `json:"should_redemptions_skip_request_queue"`
}

// handleCreateCustomReward creates a new custom reward via Twitch API
func handleCreateCustomReward(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	logger.Info("Creating custom reward")

	// Parse request body
	var req CreateRewardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.Error("Failed to parse request body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リクエストボディの解析に失敗しました",
		})
		return
	}

	// Validate required fields
	if req.Title == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "タイトルは必須です",
		})
		return
	}

	if req.Cost <= 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "コストは1以上である必要があります",
		})
		return
	}

	// Get current token
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

	// Get broadcaster ID from environment
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

	// Build Twitch API request body
	twitchReq := map[string]interface{}{
		"title":      req.Title,
		"cost":       req.Cost,
		"is_enabled": req.IsEnabled,
		"is_user_input_required": req.IsUserInputRequired,
		"should_redemptions_skip_request_queue": req.ShouldRedemptionsSkipRequestQueue,
	}

	if req.Prompt != "" {
		twitchReq["prompt"] = req.Prompt
	}

	if req.BackgroundColor != "" {
		twitchReq["background_color"] = req.BackgroundColor
	}

	if req.IsMaxPerStreamEnabled {
		twitchReq["is_max_per_stream_enabled"] = true
		twitchReq["max_per_stream"] = req.MaxPerStream
	}

	if req.IsMaxPerUserPerStreamEnabled {
		twitchReq["is_max_per_user_per_stream_enabled"] = true
		twitchReq["max_per_user_per_stream"] = req.MaxPerUserPerStream
	}

	if req.IsGlobalCooldownEnabled {
		twitchReq["is_global_cooldown_enabled"] = true
		twitchReq["global_cooldown_seconds"] = req.GlobalCooldownSeconds
	}

	// Marshal request body
	bodyJSON, err := json.Marshal(twitchReq)
	if err != nil {
		logger.Error("Failed to marshal request body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リクエストの作成に失敗しました",
		})
		return
	}

	// Call Twitch API to create custom reward
	url := fmt.Sprintf("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=%s", *broadcasterID)
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(bodyJSON))
	if err != nil {
		logger.Error("Failed to create HTTP request", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リクエストの作成に失敗しました",
		})
		return
	}

	// Set headers
	httpReq.Header.Set("Authorization", "Bearer "+token.AccessToken)
	httpReq.Header.Set("Client-Id", *env.Value.ClientID)
	httpReq.Header.Set("Content-Type", "application/json")

	// Make request
	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		logger.Error("Failed to make request", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Twitch APIへのリクエストに失敗しました",
		})
		return
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		logger.Error("Twitch API returned error", zap.Int("status", resp.StatusCode))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)

		var errorMessage string
		if resp.StatusCode == http.StatusUnauthorized {
			errorMessage = "認証エラー: トークンが無効です"
		} else if resp.StatusCode == http.StatusForbidden {
			errorMessage = "アクセス権限がありません"
		} else {
			errorMessage = fmt.Sprintf("リワードの作成に失敗しました (ステータス: %d)", resp.StatusCode)
		}

		json.NewEncoder(w).Encode(map[string]string{
			"error": errorMessage,
		})
		return
	}

	// Parse response
	var createResp struct {
		Data []TwitchCustomReward `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&createResp); err != nil {
		logger.Error("Failed to parse response", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "レスポンスの解析に失敗しました",
		})
		return
	}

	if len(createResp.Data) == 0 {
		logger.Error("No reward data in response")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リワードの作成に失敗しました",
		})
		return
	}

	// Return created reward
	logger.Info("Custom reward created successfully", zap.String("id", createResp.Data[0].ID), zap.String("title", createResp.Data[0].Title))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createResp.Data[0])
}

// handlePatchCustomReward handles PATCH request for toggling a custom reward
func handlePatchCustomReward(w http.ResponseWriter, r *http.Request) {
	// Extract reward ID from path: /api/twitch/custom-rewards/{id}/toggle
	// Path format: /api/twitch/custom-rewards/REWARD_ID/toggle
	path := strings.TrimPrefix(r.URL.Path, "/api/twitch/custom-rewards")
	path = strings.TrimPrefix(path, "/")
	pathParts := strings.Split(path, "/")

	if len(pathParts) < 1 || pathParts[0] == "" {
		http.Error(w, "Reward ID required", http.StatusBadRequest)
		return
	}
	rewardID := pathParts[0]

	logger.Info("Toggling custom reward via PATCH", zap.String("reward_id", rewardID), zap.String("path", r.URL.Path))

	// Parse request body
	var req struct {
		IsEnabled bool `json:"is_enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.Error("Failed to parse request body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リクエストボディの解析に失敗しました",
		})
		return
	}

	// Get current token
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

	// Get broadcaster ID from environment
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

	// Build request body
	twitchReq := map[string]interface{}{
		"is_enabled": req.IsEnabled,
	}

	bodyJSON, err := json.Marshal(twitchReq)
	if err != nil {
		logger.Error("Failed to marshal request body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リクエストの作成に失敗しました",
		})
		return
	}

	// Call Twitch API to update reward
	url := fmt.Sprintf("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=%s&id=%s", *broadcasterID, rewardID)
	httpReq, err := http.NewRequest("PATCH", url, bytes.NewReader(bodyJSON))
	if err != nil {
		logger.Error("Failed to create HTTP request", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リクエストの作成に失敗しました",
		})
		return
	}

	// Set headers
	httpReq.Header.Set("Authorization", "Bearer "+token.AccessToken)
	httpReq.Header.Set("Client-Id", *env.Value.ClientID)
	httpReq.Header.Set("Content-Type", "application/json")

	logger.Debug("Twitch API PATCH request",
		zap.String("url", url),
		zap.String("body", string(bodyJSON)))

	// Make request
	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		logger.Error("Failed to make request", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Twitch APIへのリクエストに失敗しました",
		})
		return
	}
	defer resp.Body.Close()

	// Read response body
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.Error("Failed to read response body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "レスポンスの読み取りに失敗しました",
		})
		return
	}

	// Check response status
	if resp.StatusCode != http.StatusOK {
		logger.Error("Twitch API returned error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(bodyBytes)))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)

		errorMessage := "Twitch APIエラー"
		if resp.StatusCode == http.StatusUnauthorized {
			errorMessage = "認証エラー: トークンが無効です"
		} else if resp.StatusCode == http.StatusForbidden {
			errorMessage = "アクセス権限がありません - このリワードは別のアプリで作成された可能性があります"
		} else if resp.StatusCode == http.StatusNotFound {
			errorMessage = "リワードが見つかりません"
		}

		json.NewEncoder(w).Encode(map[string]string{
			"error": errorMessage,
		})
		return
	}

	// Parse response
	var updateResp TwitchCustomRewardsResponse
	if err := json.Unmarshal(bodyBytes, &updateResp); err != nil {
		logger.Error("Failed to parse response", zap.Error(err), zap.String("body", string(bodyBytes)))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "レスポンスの解析に失敗しました",
		})
		return
	}

	if len(updateResp.Data) == 0 {
		logger.Error("No reward data in response")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "リワードの更新に失敗しました",
		})
		return
	}

	// Return updated reward
	logger.Info("Custom reward toggled successfully via PATCH", zap.String("id", rewardID), zap.Bool("is_enabled", req.IsEnabled))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updateResp.Data[0])
}