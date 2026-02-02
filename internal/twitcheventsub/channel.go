package twitcheventsub

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/joeyak/go-twitch-eventsub/v3"
	"github.com/ichi0g0y/twitch-overlay/internal/broadcast"
	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/notification"
	"github.com/ichi0g0y/twitch-overlay/internal/output"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/paths"
	"github.com/ichi0g0y/twitch-overlay/internal/translation"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
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

	plainMessage := buildLanguageDetectionMessage(message.Message.Fragments, message.Message.Text)
	go func(messageID string, rawMessage string, plainMessage string) {
		if messageID == "" {
			return
		}

		if message.Chatter.ChatterUserId == chatBotUserID {
			_ = localdb.UpdateChatTranslation(messageID, "", "skip", "")
			broadcast.Send(map[string]interface{}{
				"type": "chat-translation",
				"data": map[string]interface{}{
					"messageId":         messageID,
					"translation":       "",
					"translationStatus": "skip",
					"translationLang":   "",
				},
			})
			return
		}

		normalized := translation.NormalizeForLanguageDetection(plainMessage)
		langCode := translation.DetectLanguageCode(normalized)
		if translation.ShouldSkipTranslation(normalized) {
			_ = localdb.UpdateChatTranslation(messageID, "", "skip", langCode)
			broadcast.Send(map[string]interface{}{
				"type": "chat-translation",
				"data": map[string]interface{}{
					"messageId":         messageID,
					"translation":       "",
					"translationStatus": "skip",
					"translationLang":   langCode,
				},
			})
			return
		}

		db := localdb.GetDB()
		if db == nil {
			_ = localdb.UpdateChatTranslation(messageID, "", "skip", langCode)
			broadcast.Send(map[string]interface{}{
				"type": "chat-translation",
				"data": map[string]interface{}{
					"messageId":         messageID,
					"translation":       "",
					"translationStatus": "skip",
					"translationLang":   langCode,
				},
			})
			return
		}

		settingsManager := settings.NewSettingsManager(db)
		translationEnabled := true
		if value, err := settingsManager.GetRealValue("CHAT_TRANSLATION_ENABLED"); err == nil {
			translationEnabled = strings.TrimSpace(strings.ToLower(value)) != "false"
		}
		if !translationEnabled {
			_ = localdb.UpdateChatTranslation(messageID, "", "skip", langCode)
			broadcast.Send(map[string]interface{}{
				"type": "chat-translation",
				"data": map[string]interface{}{
					"messageId":         messageID,
					"translation":       "",
					"translationStatus": "skip",
					"translationLang":   langCode,
				},
			})
			return
		}

		if !translation.ShouldTranslateToJapanese(normalized) {
			_ = localdb.UpdateChatTranslation(messageID, "", "skip", langCode)
			broadcast.Send(map[string]interface{}{
				"type": "chat-translation",
				"data": map[string]interface{}{
					"messageId":         messageID,
					"translation":       "",
					"translationStatus": "skip",
					"translationLang":   langCode,
				},
			})
			return
		}

		_ = localdb.UpdateChatTranslation(messageID, "", "pending", langCode)
		broadcast.Send(map[string]interface{}{
			"type": "chat-translation",
			"data": map[string]interface{}{
				"messageId":         messageID,
				"translation":       "",
				"translationStatus": "pending",
				"translationLang":   langCode,
			},
		})

		backendValue, _ := settingsManager.GetRealValue("TRANSLATION_BACKEND")
		backend := translation.ResolveTranslationBackend(backendValue)

		var translated string
		var detectedLang string
		var err error

		switch backend {
		case translation.BackendOllama:
			baseURL, _ := settingsManager.GetRealValue("OLLAMA_BASE_URL")
			modelName, _ := settingsManager.GetRealValue("OLLAMA_MODEL")
			numPredictValue, _ := settingsManager.GetRealValue("OLLAMA_NUM_PREDICT")
			numPredict := translation.ParseOllamaNumPredict(numPredictValue)
			getSetting := func(key string) string {
				value, _ := settingsManager.GetRealValue(key)
				return strings.TrimSpace(value)
			}
			opts := translation.OllamaRequestOptions{
				NumPredict:   numPredict,
				Temperature:  translation.ParseOllamaTemperature(getSetting("OLLAMA_TEMPERATURE")),
				TopP:         translation.ParseOllamaTopP(getSetting("OLLAMA_TOP_P")),
				NumCtx:       translation.ParseOllamaNumCtx(getSetting("OLLAMA_NUM_CTX")),
				Stop:         translation.ParseOllamaStop(getSetting("OLLAMA_STOP")),
				SystemPrompt: getSetting("OLLAMA_SYSTEM_PROMPT"),
			}
			translated, detectedLang, err = translation.TranslateToTargetLanguageOllama(
				translation.ResolveOllamaBaseURL(baseURL),
				modelName,
				rawMessage,
				langCode,
				translation.DefaultTargetJapanese,
				opts,
			)
		default:
			apiKey, keyErr := settingsManager.GetRealValue("OPENAI_API_KEY")
			if keyErr != nil || apiKey == "" {
				_ = localdb.UpdateChatTranslation(messageID, "", "skip", langCode)
				broadcast.Send(map[string]interface{}{
					"type": "chat-translation",
					"data": map[string]interface{}{
						"messageId":         messageID,
						"translation":       "",
						"translationStatus": "skip",
						"translationLang":   langCode,
					},
				})
				return
			}
			modelName, _ := settingsManager.GetRealValue("OPENAI_MODEL")
			translated, detectedLang, err = translation.TranslateToJapanese(apiKey, rawMessage, modelName)
		}

		if err != nil {
			logger.Warn("Failed to translate chat message", zap.Error(err))
			_ = localdb.UpdateChatTranslation(messageID, "", "skip", langCode)
			broadcast.Send(map[string]interface{}{
				"type": "chat-translation",
				"data": map[string]interface{}{
					"messageId":         messageID,
					"translation":       "",
					"translationStatus": "skip",
					"translationLang":   langCode,
				},
			})
			return
		}

		finalLang := langCode
		detectedLang = translation.NormalizeLanguageCode(detectedLang)
		if detectedLang != "" && detectedLang != "und" {
			finalLang = detectedLang
		}

		_ = localdb.UpdateChatTranslation(messageID, translated, "done", finalLang)
		broadcast.Send(map[string]interface{}{
			"type": "chat-translation",
			"data": map[string]interface{}{
				"messageId":         messageID,
				"translation":       translated,
				"translationStatus": "done",
				"translationLang":   finalLang,
			},
		})
	}(messageID, message.Message.Text, plainMessage)

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

// HandleChannelPointsCustomRedemptionAdd はリワードイベントをキューに追加する
func HandleChannelPointsCustomRedemptionAdd(message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd) {
	// キューに追加（ノンブロッキング）
	select {
	case rewardQueue <- RewardEvent{Message: message}:
		// Event queued successfully
	default:
		logger.Error("Reward queue full, dropping event",
			zap.String("reward_id", message.Reward.ID),
			zap.String("user_name", message.User.UserName),
			zap.Int("queue_size", 1000))
	}
}

// processRewardEvent はキューから取り出したリワードイベントを処理する
func processRewardEvent(message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd) {
	// リワードカウントを増やす（リトライ付き、最大3回、指数バックオフ）
	maxRetries := 3
	var lastErr error

	for i := 0; i < maxRetries; i++ {
		err := localdb.IncrementRewardCount(message.Reward.ID, message.User.UserName)
		if err == nil {
			// 成功：通知を送信
			count, err := localdb.GetRewardCount(message.Reward.ID)
			if err != nil {
				logger.Error("Failed to get reward count after increment",
					zap.Error(err),
					zap.String("reward_id", message.Reward.ID))
				// エラーでも最低限の通知を送る
				broadcast.Send(map[string]interface{}{
					"type": "reward_count_updated",
					"data": map[string]interface{}{
						"reward_id": message.Reward.ID,
						"title":     message.Reward.Title,
						"count":     -1, // エラーを示す特殊値
						"error":     true,
					},
				})
			} else {
				count.Title = message.Reward.Title
				broadcast.Send(map[string]interface{}{
					"type": "reward_count_updated",
					"data": count,
				})
			}
			break
		}

		lastErr = err
		logger.Warn("Failed to increment reward count, retrying...",
			zap.Error(err),
			zap.Int("attempt", i+1),
			zap.String("reward_id", message.Reward.ID))

		time.Sleep(time.Duration(50*(i+1)) * time.Millisecond) // 指数バックオフ（50ms, 100ms, 150ms）
	}

	if lastErr != nil {
		logger.Error("Failed to increment reward count after retries",
			zap.Error(lastErr),
			zap.String("reward_id", message.Reward.ID),
			zap.String("user_name", message.User.UserName),
			zap.Int("maxRetries", maxRetries))
		return // エラー時はここで終了（通知・プリンター処理をスキップ）
	}

	// 通知をキューに追加（全てのチャネポを通知）
	notificationMessage := fmt.Sprintf("【%s】(%dpt) %s",
		message.Reward.Title,
		message.Reward.Cost,
		message.UserInput)
	notification.EnqueueNotification(
		message.User.UserName,
		notificationMessage,
	)

	// プレゼントルーレット対象リワードかチェック
	db, err := localdb.SetupDB(paths.GetDBPath())
	if err == nil {
		settingsManager := settings.NewSettingsManager(db)
		lotteryRewardID, _ := settingsManager.GetRealValue("LOTTERY_REWARD_ID")

		// LOTTERY_ENABLEDチェックは廃止。Twitch API側でリワードの有効/無効を制御
		if lotteryRewardID != "" && message.Reward.ID == lotteryRewardID {
			// アバターURLを取得
			avatarURL := ""
			if message.User.UserID != "" {
				if avatar, err := getUserAvatar(message.User.UserID); err == nil {
					avatarURL = avatar
				}
			}

			// サブスク情報を取得
			isSubscriber := false
			subscriberTier := ""
			broadcasterID := *env.Value.TwitchUserID
			if broadcasterID != "" && message.User.UserID != "" {
				if subInfo, err := twitchapi.GetUserSubscription(broadcasterID, message.User.UserID); err == nil {
					isSubscriber = true
					subscriberTier = subInfo.Tier
					logger.Debug("User subscription info retrieved",
						zap.String("user_id", message.User.UserID),
						zap.String("tier", subInfo.Tier),
						zap.Bool("is_gift", subInfo.IsGift))
				} else {
					logger.Debug("User is not subscribed or failed to get subscription info",
						zap.String("user_id", message.User.UserID),
						zap.Error(err))
				}
			}

			// 参加者情報を作成
			participant := types.PresentParticipant{
				UserID:         message.User.UserID,
				Username:       message.User.UserLogin,
				DisplayName:    message.User.UserName,
				AvatarURL:      avatarURL,
				RedeemedAt:     time.Now(),
				IsSubscriber:   isSubscriber,
				SubscriberTier: subscriberTier,
				EntryCount:     1,  // デフォルトは1口
				AssignedColor:  "", // 色は自動割り当て
			}

			// DBに保存
			if err := localdb.AddLotteryParticipant(participant); err != nil {
				logger.Error("Failed to add lottery participant to database",
					zap.Error(err),
					zap.String("user_id", message.User.UserID),
					zap.String("username", message.User.UserLogin))
			} else {
				// データベースから最新の参加者情報を取得（entry_countが正しく加算された状態）
				allParticipants, err := localdb.GetAllLotteryParticipants()
				if err != nil {
					logger.Error("Failed to get lottery participants after add",
						zap.Error(err))
				} else {
					// 追加/更新されたユーザーを見つける
					var updatedParticipant *types.PresentParticipant
					for i := range allParticipants {
						if allParticipants[i].UserID == participant.UserID {
							updatedParticipant = &allParticipants[i]
							break
						}
					}

					if updatedParticipant != nil {
						// WebSocketで通知（データベースから取得した最新の値を送信）
						broadcast.Send(map[string]interface{}{
							"type": "lottery_participant_added",
							"data": *updatedParticipant,
						})

						logger.Info("Lottery participant added",
							zap.String("user_id", message.User.UserID),
							zap.String("username", message.User.UserLogin),
							zap.Int("entry_count", updatedParticipant.EntryCount),
							zap.String("reward_id", message.Reward.ID),
							zap.String("reward_title", message.Reward.Title))
					}
				}
			}
		}
	}

	// プリンター印刷は指定IDのチャネポのみ
	if message.Reward.ID != *env.Value.TriggerCustomRewordID {
		logger.Debug("Skipping print for non-configured reward",
			zap.String("rewardId", message.Reward.ID),
			zap.String("rewardTitle", message.Reward.Title))
		return
	}

	// Parse user input to handle emotes
	fragments := ParseUserInputToFragments(message.UserInput)

	// If no fragments or empty, create text-only fragment
	if len(fragments) == 0 {
		logger.Debug("No fragments created, using text-only fragment",
			zap.String("userInput", message.UserInput))
		fragments = []twitch.ChatMessageFragment{
			{
				Type: "text",
				Text: message.UserInput,
			},
		}
	}

	// Log fragment details for debugging
	for i, frag := range fragments {
		if frag.Emote != nil {
			logger.Info("Fragment with emote",
				zap.Int("index", i),
				zap.String("type", frag.Type),
				zap.String("text", frag.Text),
				zap.String("emote_id", frag.Emote.Id))
		} else {
			logger.Debug("Fragment without emote",
				zap.Int("index", i),
				zap.String("type", frag.Type),
				zap.String("text", frag.Text))
		}
	}

	// アバターURLを取得
	avatarURL := ""
	if message.User.UserID != "" {
		avatar, err := getUserAvatar(message.User.UserID)
		if err != nil {
			logger.Warn("Failed to get user avatar for channel points event",
				zap.String("user_id", message.User.UserID),
				zap.Error(err))
		} else {
			avatarURL = avatar
		}
	}

	// Print the message with emotes and avatar
	output.PrintOut(message.User.UserName, fragments, avatarURL, time.Now())

	logger.Info("チャネポ処理完了",
		zap.String("user", message.User.UserName),
		zap.String("reward", message.Reward.Title),
		zap.String("userInput", message.UserInput),
		zap.Int("fragments", len(fragments)),
		zap.String("avatar_url", avatarURL))
}

func HandleChannelCheer(message twitch.EventChannelCheer) {
	title := "ビッツありがとう :)"
	userName := message.User.UserName
	details := fmt.Sprintf("%d ビッツ", message.Bits)

	// アバターURLを取得
	avatarURL := ""
	if message.User.UserID != "" {
		avatar, err := getUserAvatar(message.User.UserID)
		if err != nil {
			logger.Warn("Failed to get user avatar for cheer event",
				zap.String("user_id", message.User.UserID),
				zap.Error(err))
		} else {
			avatarURL = avatar
		}
	}

	// FAX印刷（アバター付き）
	output.PrintOutWithTitle(title, userName, "", details, avatarURL, time.Now())

	// 通知をキューに追加（アバター付き）
	notificationMessage := fmt.Sprintf("%s - %d ビッツ", title, message.Bits)
	notification.EnqueueNotificationWithFragmentsAndAvatar(userName, notificationMessage, nil, avatarURL)
}
func HandleChannelFollow(message twitch.EventChannelFollow) {
	title := "フォローありがとう :)"
	userName := message.User.UserName
	details := "" // フォローの場合は詳細なし

	// アバターURLを取得
	avatarURL := ""
	if message.User.UserID != "" {
		avatar, err := getUserAvatar(message.User.UserID)
		if err != nil {
			logger.Warn("Failed to get user avatar for follow event",
				zap.String("user_id", message.User.UserID),
				zap.Error(err))
		} else {
			avatarURL = avatar
		}
	}

	// FAX印刷（アバター付き）
	output.PrintOutWithTitle(title, userName, "", details, avatarURL, time.Now())

	// 通知をキューに追加（アバター付き）
	notification.EnqueueNotificationWithFragmentsAndAvatar(userName, title, nil, avatarURL)
}
func HandleChannelRaid(message twitch.EventChannelRaid) {
	title := "レイドありがとう :)"
	userName := message.FromBroadcasterUserName
	details := fmt.Sprintf("%d 人", message.Viewers)

	// アバターURLを取得
	avatarURL := ""
	if message.FromBroadcasterUserId != "" {
		avatar, err := getUserAvatar(message.FromBroadcasterUserId)
		if err != nil {
			logger.Warn("Failed to get user avatar for raid event",
				zap.String("user_id", message.FromBroadcasterUserId),
				zap.Error(err))
		} else {
			avatarURL = avatar
		}
	}

	// FAX印刷（アバター付き）
	output.PrintOutWithTitle(title, userName, "", details, avatarURL, time.Now())

	// 通知をキューに追加（アバター付き）
	notificationMessage := fmt.Sprintf("%s - %d 人", title, message.Viewers)
	notification.EnqueueNotificationWithFragmentsAndAvatar(userName, notificationMessage, nil, avatarURL)
}
func HandleChannelShoutoutReceive(message twitch.EventChannelShoutoutReceive) {
	title := "応援ありがとう :)"
	userName := message.FromBroadcasterUserName
	details := "" // シャウトアウトの場合は詳細なし

	// アバターURLを取得
	avatarURL := ""
	if message.FromBroadcasterUserId != "" {
		avatar, err := getUserAvatar(message.FromBroadcasterUserId)
		if err != nil {
			logger.Warn("Failed to get user avatar for shoutout event",
				zap.String("user_id", message.FromBroadcasterUserId),
				zap.Error(err))
		} else {
			avatarURL = avatar
		}
	}

	// FAX印刷（アバター付き）
	output.PrintOutWithTitle(title, userName, "", details, avatarURL, time.Now())

	// 通知をキューに追加（アバター付き）
	notification.EnqueueNotificationWithFragmentsAndAvatar(userName, title, nil, avatarURL)
}
func HandleChannelSubscribe(message twitch.EventChannelSubscribe) {
	if !message.IsGift {
		title := "サブスクありがとう :)"
		userName := message.User.UserName
		details := fmt.Sprintf("Tier %s", message.Tier)

		// アバターURLを取得
		avatarURL := ""
		if message.User.UserID != "" {
			avatar, err := getUserAvatar(message.User.UserID)
			if err != nil {
				logger.Warn("Failed to get user avatar for subscribe event",
					zap.String("user_id", message.User.UserID),
					zap.Error(err))
			} else {
				avatarURL = avatar
			}
		}

		// FAX印刷（アバター付き）
		output.PrintOutWithTitle(title, userName, "", details, avatarURL, time.Now())

		// 通知をキューに追加（アバター付き）
		notificationMessage := fmt.Sprintf("%s - Tier %s", title, message.Tier)
		notification.EnqueueNotificationWithFragmentsAndAvatar(userName, notificationMessage, nil, avatarURL)
	} else {
		title := "サブギフおめです :)"
		userName := message.User.UserName
		details := fmt.Sprintf("Tier %s", message.Tier)

		// アバターURLを取得
		avatarURL := ""
		if message.User.UserID != "" {
			avatar, err := getUserAvatar(message.User.UserID)
			if err != nil {
				logger.Warn("Failed to get user avatar for gift sub event",
					zap.String("user_id", message.User.UserID),
					zap.Error(err))
			} else {
				avatarURL = avatar
			}
		}

		// FAX印刷（アバター付き）
		output.PrintOutWithTitle(title, userName, "", details, avatarURL, time.Now())

		// 通知をキューに追加（アバター付き）
		notificationMessage := fmt.Sprintf("%s - Tier %s", title, message.Tier)
		notification.EnqueueNotificationWithFragmentsAndAvatar(userName, notificationMessage, nil, avatarURL)
	}
}

func HandleChannelSubscriptionGift(message twitch.EventChannelSubscriptionGift) {
	title := "サブギフありがとう :)"

	if !message.IsAnonymous {
		userName := message.User.UserName
		details := fmt.Sprintf("Tier %s | %d個", message.Tier, message.Total)

		// アバターURLを取得
		avatarURL := ""
		if message.User.UserID != "" {
			avatar, err := getUserAvatar(message.User.UserID)
			if err != nil {
				logger.Warn("Failed to get user avatar for subscription gift event",
					zap.String("user_id", message.User.UserID),
					zap.Error(err))
			} else {
				avatarURL = avatar
			}
		}

		// FAX印刷（アバター付き）
		output.PrintOutWithTitle(title, userName, "", details, avatarURL, time.Now())

		// 通知をキューに追加（アバター付き）
		notificationMessage := fmt.Sprintf("%s - Tier %s | %d個", title, message.Tier, message.Total)
		notification.EnqueueNotificationWithFragmentsAndAvatar(userName, notificationMessage, nil, avatarURL)
	} else {
		userName := "匿名さん"
		details := fmt.Sprintf("Tier %s | %d個", message.Tier, message.Total)

		// 匿名はアバターなし
		output.PrintOutWithTitle(title, userName, "", details, "", time.Now())

		// 通知をキューに追加
		notificationMessage := fmt.Sprintf("%s - Tier %s | %d個", title, message.Tier, message.Total)
		notification.EnqueueNotification(userName, notificationMessage)
	}
}

func HandleChannelSubscriptionMessage(message twitch.EventChannelSubscriptionMessage) {
	// 再サブスクメッセージの処理
	var title string
	var extra string
	var details string

	if message.CumulativeMonths > 1 {
		// 再サブスク - 4行レイアウト
		title = "サブスクありがとう :)"
		extra = fmt.Sprintf("%d ヶ月目", message.CumulativeMonths)
		details = message.Message.Text // 空メッセージの場合は空文字列
	} else {
		// 初回サブスク（メッセージ付き）
		title = "サブスクありがとう :)"
		extra = ""                     // 初回は月数なし
		details = message.Message.Text // 空メッセージの場合は空文字列のまま
	}

	userName := message.User.UserName

	// アバターURLを取得
	avatarURL := ""
	if message.User.UserID != "" {
		avatar, err := getUserAvatar(message.User.UserID)
		if err != nil {
			logger.Warn("Failed to get user avatar for resub event",
				zap.String("user_id", message.User.UserID),
				zap.Error(err))
		} else {
			avatarURL = avatar
		}
	}

	// FAX印刷（アバター付き）
	output.PrintOutWithTitle(title, userName, extra, details, avatarURL, time.Now())

	// 通知をキューに追加
	var notificationMessage string
	if message.CumulativeMonths > 1 {
		if message.Message.Text != "" {
			notificationMessage = fmt.Sprintf("%s - %d ヶ月目 - %s", title, message.CumulativeMonths, message.Message.Text)
		} else {
			notificationMessage = fmt.Sprintf("%s - %d ヶ月目", title, message.CumulativeMonths)
		}
	} else {
		if message.Message.Text != "" {
			notificationMessage = fmt.Sprintf("%s - %s", title, message.Message.Text)
		} else {
			notificationMessage = title
		}
	}
	notification.EnqueueNotificationWithFragmentsAndAvatar(userName, notificationMessage, nil, avatarURL)

	logger.Info("サブスクメッセージ",
		zap.String("user", message.User.UserName),
		zap.Int("cumulative_months", message.CumulativeMonths),
		zap.Int("streak_months", message.StreakMonths),
		zap.String("tier", message.Tier),
		zap.String("message", message.Message.Text))
}
