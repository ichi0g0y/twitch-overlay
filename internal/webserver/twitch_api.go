package webserver

import (
	"encoding/json"
	"fmt"
	"net/http"

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
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

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