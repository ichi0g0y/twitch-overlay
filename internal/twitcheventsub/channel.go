package twitcheventsub

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/broadcast"
	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/notification"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"github.com/joeyak/go-twitch-eventsub/v3"
	"go.uber.org/zap"
)

// RewardEvent はリワードイベントをキューで処理するための構造体
type RewardEvent struct {
	Message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd
}

// リワードイベント処理用のキュー
var (
	rewardQueue       = make(chan RewardEvent, 1000)
	rewardQueueOnce   sync.Once
	rewardQueueCancel context.CancelFunc // ワーカー停止用
	rewardQueueCtx    context.Context    // ワーカー用context
)

const chatBotUserID = "774281749"

func buildLanguageDetectionMessage(fragments []twitch.ChatMessageFragment, fallback string) string {
	var builder strings.Builder
	hasText := false
	hasEmote := false
	for _, fragment := range fragments {
		if fragment.Type == "text" {
			builder.WriteString(fragment.Text)
			hasText = true
			continue
		}
		if fragment.Type == "emote" {
			hasEmote = true
		}
	}

	plain := strings.TrimSpace(builder.String())
	if plain == "" {
		if hasEmote && !hasText {
			return ""
		}
		return fallback
	}
	return plain
}

// StartRewardQueueWorker はリワードイベント処理ワーカーを起動する
// アプリケーション起動時に一度だけ呼ばれる
func StartRewardQueueWorker() {
	rewardQueueOnce.Do(func() {
		rewardQueueCtx, rewardQueueCancel = context.WithCancel(context.Background())
		go processRewardQueue(rewardQueueCtx)
	})
}

// StopRewardQueueWorker はリワードイベント処理ワーカーを停止する
// EventSub再接続時に呼ばれる
func StopRewardQueueWorker() {
	if rewardQueueCancel != nil {
		logger.Info("Stopping reward queue worker")
		rewardQueueCancel()
		rewardQueueCancel = nil

		// sync.Onceをリセット（次回Start時に再起動可能にする）
		rewardQueueOnce = sync.Once{}
	}
}

// processRewardQueue はキューからリワードイベントを取り出して順次処理する
func processRewardQueue(ctx context.Context) {
	logger.Info("Reward queue worker started")
	for {
		select {
		case <-ctx.Done():
			logger.Info("Reward queue worker stopped")
			return
		case event := <-rewardQueue:
			processRewardEvent(event.Message)
		}
	}
}

// getUserAvatar はユーザーのアバターURLを取得する
// デバッグモード（UserIDが"debug-"で始まる）の場合は、設定からTWITCH_USER_IDを取得してそのアバターを使う
func getUserAvatar(userID string) (string, error) {
	// デバッグモードの判定
	if strings.HasPrefix(userID, "debug-") {
		// デバッグモードの場合は設定からTWITCH_USER_IDを取得
		db := localdb.GetDB()
		if db == nil {
			return "", fmt.Errorf("database not initialized")
		}

		settingsManager := settings.NewSettingsManager(db)
		twitchUserID, err := settingsManager.GetRealValue("TWITCH_USER_ID")
		if err != nil || twitchUserID == "" {
			logger.Warn("Failed to get TWITCH_USER_ID for debug mode",
				zap.Error(err))
			return "", fmt.Errorf("TWITCH_USER_ID not configured")
		}

		logger.Debug("Using broadcaster's avatar for debug mode",
			zap.String("broadcaster_id", twitchUserID))

		// 配信者のアバターを取得
		return twitchapi.GetUserAvatar(twitchUserID)
	}

	// 通常モードの場合はそのままユーザーのアバターを取得
	return twitchapi.GetUserAvatar(userID)
}

func HandleChannelChatMessage(message twitch.EventChannelChatMessage) {
	// Extract and cache emote information from chat messages
	// This helps recognize emotes from other channels used in channel point redemptions
	for _, fragment := range message.Message.Fragments {
		if fragment.Emote != nil && fragment.Emote.Id != "" && fragment.Text != "" {
			// Construct emote URL (use 3.0 format for high quality)
			url := fmt.Sprintf("https://static-cdn.jtvnw.net/emoticons/v2/%s/static/light/3.0", fragment.Emote.Id)

			// Add to dynamic cache
			twitchapi.AddEmoteDynamically(fragment.Text, fragment.Emote.Id, url)

			logger.Debug("Cached emote from chat message",
				zap.String("name", fragment.Text),
				zap.String("id", fragment.Emote.Id),
				zap.String("user", message.Chatter.ChatterUserName))
		}
	}

	// チャンネルポイント報酬はHandleChannelPointsCustomRedemptionAddで処理するため、
	// ここでは処理しない（重複防止）
	if message.ChannelPointsCustomRewardId != "" {
		// Note: 通知はHandleChannelPointsCustomRedemptionAddで行う
		return
	}

	// フラグメント情報を構築（通知用）
	fragments := buildFragmentsForNotification(message.Message.Fragments)
	messageID := message.MessageId

	if messageID != "" {
		exists, err := localdb.ChatMessageExistsByMessageID(messageID)
		if err != nil {
			logger.Warn("Failed to check chat message duplication", zap.Error(err))
		} else if exists {
			logger.Debug("Duplicate chat message detected, skipping", zap.String("message_id", messageID))
			return
		}
	}

	avatarURL := ""
	if message.Chatter.ChatterUserId != "" {
		if cachedAvatar, err := localdb.GetLatestChatAvatar(message.Chatter.ChatterUserId); err == nil && cachedAvatar != "" {
			avatarURL = cachedAvatar
		} else if avatar, err := getUserAvatar(message.Chatter.ChatterUserId); err == nil {
			avatarURL = avatar
		} else if err != nil {
			logger.Debug("Failed to get chat avatar", zap.Error(err))
		}
	}

	fragmentsJSON := ""
	if len(fragments) > 0 {
		if encoded, err := json.Marshal(fragments); err == nil {
			fragmentsJSON = string(encoded)
		} else {
			logger.Warn("Failed to encode chat fragments", zap.Error(err))
		}
	}

	translationText := ""
	translationStatus := ""
	translationLang := ""

	inserted, err := localdb.AddChatMessage(localdb.ChatMessageRow{
		MessageID:         messageID,
		UserID:            message.Chatter.ChatterUserId,
		Username:          message.Chatter.ChatterUserName,
		Message:           message.Message.Text,
		FragmentsJSON:     fragmentsJSON,
		AvatarURL:         avatarURL,
		Translation:       translationText,
		TranslationStatus: translationStatus,
		TranslationLang:   translationLang,
		CreatedAt:         time.Now().Unix(),
	})
	if err != nil {
		logger.Warn("Failed to store chat message", zap.Error(err))
	}
	if messageID != "" && !inserted {
		logger.Debug("Duplicate chat message detected, skipping broadcast",
			zap.String("message_id", messageID))
		return
	}

	cutoff := time.Now().AddDate(0, 0, -7).Unix()
	if err := localdb.CleanupChatMessagesBefore(cutoff); err != nil {
		logger.Warn("Failed to cleanup chat history", zap.Error(err))
	}

	// 通知をキューに追加（フラグメント付き）
	notification.EnqueueNotificationWithFragments(
		message.Chatter.ChatterUserName,
		message.Message.Text,
		fragments,
	)

	// サイドバー用にチャットメッセージをブロードキャスト
	broadcast.Send(map[string]interface{}{
		"type": "chat-message",
		"data": map[string]interface{}{
			"username":          message.Chatter.ChatterUserName,
			"userId":            message.Chatter.ChatterUserId,
			"messageId":         messageID,
			"message":           message.Message.Text,
			"fragments":         fragments,
			"avatarUrl":         avatarURL,
			"translation":       translationText,
			"translationStatus": translationStatus,
			"translationLang":   translationLang,
			"timestamp":         time.Now().Format(time.RFC3339),
		},
	})

	logger.Debug("Chat message processed",
		zap.String("user", message.Chatter.ChatterUserName),
		zap.String("message", message.Message.Text),
		zap.Int("fragments_count", len(fragments)))
}

// buildFragmentsForNotification converts Twitch message fragments to notification fragments
func buildFragmentsForNotification(fragments []twitch.ChatMessageFragment) []notification.FragmentInfo {
	var result []notification.FragmentInfo

	for _, frag := range fragments {
		if frag.Emote != nil && frag.Emote.Id != "" {
			// エモートフラグメント
			// Try to get URL from emote cache first (which has actual URLs from API)
			var url string
			if emoteInfo, ok := twitchapi.GetEmoteByID(frag.Emote.Id); ok && emoteInfo.Images.URL4x != "" {
				url = emoteInfo.Images.URL4x
				logger.Debug("buildFragmentsForNotification: using cached emote URL",
					zap.String("emote_id", frag.Emote.Id),
					zap.String("url", url))
			} else {
				// Fallback to constructing URL from ID (use 2.0 for notification window size)
				url = fmt.Sprintf("https://static-cdn.jtvnw.net/emoticons/v2/%s/static/light/2.0", frag.Emote.Id)
				logger.Debug("buildFragmentsForNotification: using constructed emote URL",
					zap.String("emote_id", frag.Emote.Id),
					zap.String("url", url))
			}

			result = append(result, notification.FragmentInfo{
				Type:     "emote",
				Text:     frag.Text,
				EmoteID:  frag.Emote.Id,
				EmoteURL: url,
			})
		} else {
			// テキストフラグメント
			result = append(result, notification.FragmentInfo{
				Type: "text",
				Text: frag.Text,
			})
		}
	}

	return result
}
