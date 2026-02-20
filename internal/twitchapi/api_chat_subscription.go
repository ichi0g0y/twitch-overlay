package twitchapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// UserChatColor はユーザーのチャット色情報を表す。
type UserChatColor struct {
	UserID    string `json:"user_id"`
	UserName  string `json:"user_name"`
	UserLogin string `json:"user_login"`
	Color     string `json:"color"`
}

// GetUserChatColors は指定ユーザーのチャット色を取得する。
// 指定された全user_idの色を返す。色が未設定の場合、Colorフィールドは空になる。
// 1リクエストにつき最大100ユーザー。
func GetUserChatColors(userIDs []string) ([]UserChatColor, error) {
	if len(userIDs) == 0 {
		return []UserChatColor{}, nil
	}

	// Twitch APIの制限により最大100ユーザーに制限する
	if len(userIDs) > 100 {
		logger.Warn("Too many user IDs provided, limiting to 100", zap.Int("provided", len(userIDs)))
		userIDs = userIDs[:100]
	}

	// 複数のuser_idクエリパラメータを持つURLを構築する
	u, err := url.Parse("https://api.twitch.tv/helix/chat/color")
	if err != nil {
		return nil, fmt.Errorf("failed to parse URL: %w", err)
	}

	q := u.Query()
	for _, id := range userIDs {
		q.Add("user_id", id)
	}
	u.RawQuery = q.Encode()

	reqURL := u.String()
	logger.Debug("Getting user chat colors", zap.Int("user_count", len(userIDs)))

	resp, err := makeAuthenticatedGetRequest(reqURL)
	if err != nil {
		return nil, fmt.Errorf("failed to get user chat colors: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		logger.Error("Twitch API returned error for chat colors",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(bodyBytes)))
		return nil, fmt.Errorf("API request failed with status: %d", resp.StatusCode)
	}

	var result struct {
		Data []UserChatColor `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	logger.Debug("Successfully retrieved user chat colors",
		zap.Int("requested", len(userIDs)),
		zap.Int("received", len(result.Data)))

	return result.Data, nil
}

// UserSubscription はユーザーのサブスク情報を表す。
type UserSubscription struct {
	UserID    string `json:"user_id"`
	UserName  string `json:"user_name"`
	UserLogin string `json:"user_login"`
	Tier      string `json:"tier"` // "1000", "2000", or "3000"
	IsGift    bool   `json:"is_gift"`
	// Helix /subscriptions では返却されないため、多くの場合は 0 になる。
	// 利用時は ResolveSubscribedMonths でフォールバックする。
	CumulativeMonths int `json:"cumulative_months,omitempty"`
}

var ErrUserNotSubscribed = errors.New("user is not subscribed")

// GetUserSubscription は特定ユーザーのサブスク情報を取得する。
// サブスク登録済みの場合はサブスク情報を返し、未登録の場合はエラーを返す。
func GetUserSubscription(broadcasterID, userID string) (*UserSubscription, error) {
	reqURL := fmt.Sprintf("https://api.twitch.tv/helix/subscriptions?broadcaster_id=%s&user_id=%s",
		url.QueryEscape(broadcasterID), url.QueryEscape(userID))

	resp, err := makeAuthenticatedGetRequest(reqURL)
	if err != nil {
		return nil, fmt.Errorf("failed to get subscription info: %w", err)
	}
	defer resp.Body.Close()

	// 404または400はサブスク未登録を意味する
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusBadRequest {
		return nil, ErrUserNotSubscribed
	}

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		logger.Warn("Twitch API returned error for subscription check",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(bodyBytes)))
		return nil, fmt.Errorf("API request failed with status: %d", resp.StatusCode)
	}

	var result struct {
		Data []UserSubscription `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Data) == 0 {
		return nil, ErrUserNotSubscribed
	}

	logger.Debug("Successfully retrieved user subscription info",
		zap.String("user_id", userID),
		zap.String("tier", result.Data[0].Tier))

	return &result.Data[0], nil
}
