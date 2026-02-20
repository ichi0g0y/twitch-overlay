package twitchapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// BitsLeaderboardEntry はビッツランキングの1エントリを表す。
type BitsLeaderboardEntry struct {
	UserID    string `json:"user_id"`
	UserLogin string `json:"user_login"`
	UserName  string `json:"user_name"`
	Rank      int    `json:"rank"`
	Score     int    `json:"score"`
	AvatarURL string // 別途取得して設定する
}

// BitsLeaderboardResponse はビッツランキングAPIのレスポンス全体を表す。
type BitsLeaderboardResponse struct {
	Data      []BitsLeaderboardEntry `json:"data"`
	DateRange struct {
		StartedAt string `json:"started_at"`
		EndedAt   string `json:"ended_at"`
	} `json:"date_range"`
	Total int `json:"total"`
}

// GetBitsLeaderboard は指定期間のビッツランキングを取得する。
func GetBitsLeaderboard(period string) ([]*BitsLeaderboardEntry, *BitsLeaderboardResponse, error) {
	logger.Info("Getting bits leaderboard", zap.String("period", period))

	// "month"期間の場合はstarted_atパラメータを指定する必要がある
	var reqURL string
	if period == "month" {
		// 当月1日を取得する
		// Twitch APIはPSTタイムゾーンを使用するため、UTCに8時間加算して正しい月を取得する
		// UTC 08:00:00 = PST 00:00:00
		now := time.Now()
		firstOfMonth := time.Date(now.Year(), now.Month(), 1, 8, 0, 0, 0, time.UTC)
		startedAt := firstOfMonth.Format(time.RFC3339)
		reqURL = fmt.Sprintf("https://api.twitch.tv/helix/bits/leaderboard?count=5&period=%s&started_at=%s&broadcaster_id=%s",
			url.QueryEscape(period), url.QueryEscape(startedAt), url.QueryEscape(*env.Value.TwitchUserID))
	} else {
		reqURL = fmt.Sprintf("https://api.twitch.tv/helix/bits/leaderboard?count=5&period=%s&broadcaster_id=%s",
			url.QueryEscape(period), url.QueryEscape(*env.Value.TwitchUserID))
	}

	resp, err := makeAuthenticatedGetRequest(reqURL)
	if err != nil {
		logger.Warn("Failed to get bits leaderboard, returning empty result", zap.Error(err))
		return nil, nil, nil // 後方互換性のためエラーではなく空の結果を返す
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("API request failed with status: %d", resp.StatusCode)
	}

	var result BitsLeaderboardResponse

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, nil, err
	}

	if len(result.Data) == 0 {
		return nil, &result, nil // リーダーが見つからない場合でもdate_rangeのためにレスポンスを返す
	}

	// 1位のアバターのみ取得する
	if len(result.Data) > 0 {
		avatarURL, err := GetUserAvatar(result.Data[0].UserID)
		if err != nil {
			logger.Warn("Failed to get user avatar", zap.Error(err))
			// アバターなしで続行する
		} else {
			result.Data[0].AvatarURL = avatarURL
		}
	}

	// リーダーのスライスを返す
	leaders := make([]*BitsLeaderboardEntry, len(result.Data))
	for i := range result.Data {
		leaders[i] = &result.Data[i]
	}

	return leaders, &result, nil
}

// GetUserAvatar はユーザーのプロフィール画像URLを取得する。
func GetUserAvatar(userID string) (string, error) {
	reqURL := fmt.Sprintf("https://api.twitch.tv/helix/users?id=%s", url.QueryEscape(userID))

	resp, err := makeAuthenticatedGetRequest(reqURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API request failed with status: %d", resp.StatusCode)
	}

	var result struct {
		Data []struct {
			ProfileImageURL string `json:"profile_image_url"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Data) == 0 {
		return "", fmt.Errorf("user not found")
	}

	return result.Data[0].ProfileImageURL, nil
}

// UpdateCustomRewardEnabled はTwitch APIを通じてカスタムリワードの有効状態を更新する。
func UpdateCustomRewardEnabled(broadcasterID, rewardID string, enabled bool, accessToken string) error {
	reqURL := fmt.Sprintf("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=%s&id=%s",
		url.QueryEscape(broadcasterID), url.QueryEscape(rewardID))

	// リクエストボディを作成する
	body := map[string]interface{}{
		"is_enabled": enabled,
	}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request body: %w", err)
	}

	logger.Debug("Twitch API PATCH request",
		zap.String("url", reqURL),
		zap.String("body", string(bodyJSON)),
		zap.String("client_id", *env.Value.ClientID))

	// ボディ付きPATCHリクエストを作成する
	req, err := http.NewRequest("PATCH", reqURL, bytes.NewReader(bodyJSON))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// ヘッダーを設定する
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Client-Id", *env.Value.ClientID)
	req.Header.Set("Content-Type", "application/json")

	// リクエストを実行する
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	// レスポンスを確認する
	if resp.StatusCode != http.StatusOK {
		// エラー詳細のためにレスポンスボディを読み込む
		bodyBytes, _ := io.ReadAll(resp.Body)
		logger.Error("Twitch API returned error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(bodyBytes)))
		return fmt.Errorf("twitch API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	logger.Info("Custom reward updated successfully via Twitch API",
		zap.String("reward_id", rewardID),
		zap.Bool("enabled", enabled))

	return nil
}
