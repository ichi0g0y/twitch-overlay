package twitcheventsub

import (
	"errors"
	"fmt"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/broadcast"
	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/notification"
	"github.com/ichi0g0y/twitch-overlay/internal/output"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/paths"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
	"github.com/joeyak/go-twitch-eventsub/v3"
	"go.uber.org/zap"
)

// HandleChannelPointsCustomRedemptionAdd はリワードイベントをキューに追加する
func HandleChannelPointsCustomRedemptionAdd(message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd) {
	// キューに追加（ノンブロッキング）
	select {
	case rewardQueue <- RewardEvent{Message: message}:
		// キューへの追加成功
	default:
		logger.Error("Reward queue full, dropping event",
			zap.String("reward_id", message.Reward.ID),
			zap.String("user_name", message.User.UserName),
			zap.Int("queue_size", 1000))
	}
}

// processRewardEvent はキューから取り出したリワードイベントを処理する
func processRewardEvent(message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd) {
	if err := incrementRewardCountWithRetry(message); err != nil {
		return
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

	// プレゼントルーレット対象リワードかチェック・登録
	registerLotteryParticipant(message)

	// プリンター印刷は指定IDのチャネポのみ
	if env.Value.TriggerCustomRewordID == nil || message.Reward.ID != *env.Value.TriggerCustomRewordID {
		logger.Debug("Skipping print for non-configured reward",
			zap.String("rewardId", message.Reward.ID),
			zap.String("rewardTitle", message.Reward.Title))
		return
	}

	printRewardMessage(message)
}

// incrementRewardCountWithRetry はリワードカウントをリトライ付きで増加させる
func incrementRewardCountWithRetry(message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd) error {
	maxRetries := 3
	var lastErr error

	for i := 0; i < maxRetries; i++ {
		err := localdb.IncrementRewardCount(message.Reward.ID, message.User.UserName)
		if err == nil {
			count, err := localdb.GetRewardCount(message.Reward.ID)
			if err != nil {
				logger.Error("Failed to get reward count after increment",
					zap.Error(err),
					zap.String("reward_id", message.Reward.ID))
				broadcast.Send(map[string]interface{}{
					"type": "reward_count_updated",
					"data": map[string]interface{}{
						"reward_id": message.Reward.ID,
						"title":     message.Reward.Title,
						"count":     -1,
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
			return nil
		}

		lastErr = err
		logger.Warn("Failed to increment reward count, retrying...",
			zap.Error(err),
			zap.Int("attempt", i+1),
			zap.String("reward_id", message.Reward.ID))

		time.Sleep(time.Duration(50*(i+1)) * time.Millisecond)
	}

	logger.Error("Failed to increment reward count after retries",
		zap.Error(lastErr),
		zap.String("reward_id", message.Reward.ID),
		zap.String("user_name", message.User.UserName),
		zap.Int("maxRetries", maxRetries))
	return lastErr
}

// registerLotteryParticipant は抽選対象リワードの場合に参加者をDB登録しWebSocket通知する
func registerLotteryParticipant(message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd) {
	db, err := localdb.SetupDB(paths.GetDBPath())
	if err != nil {
		return
	}

	settingsManager := settings.NewSettingsManager(db)
	lotteryRewardID, _ := settingsManager.GetRealValue("LOTTERY_REWARD_ID")
	if lotteryRewardID == "" || message.Reward.ID != lotteryRewardID {
		return
	}

	var existingParticipant *types.PresentParticipant
	if message.User.UserID != "" {
		existing, err := loadExistingLotteryParticipant(message.User.UserID)
		if err != nil {
			logger.Warn("Failed to load existing lottery participant, fallback to defaults",
				zap.String("user_id", message.User.UserID),
				zap.Error(err))
		} else {
			existingParticipant = existing
		}
	}

	// アバターURLを取得
	avatarURL := ""
	if message.User.UserID != "" {
		if avatar, err := getUserAvatar(message.User.UserID); err == nil {
			avatarURL = avatar
		}
	}

	// サブスク情報を取得
	isSubscriber, subscriberTier, subscribedMonths := resolveSubscriptionState(existingParticipant, nil, nil)
	if env.Value.TwitchUserID != nil && *env.Value.TwitchUserID != "" && message.User.UserID != "" {
		broadcasterID := *env.Value.TwitchUserID
		if subInfo, err := twitchapi.GetUserSubscriptionCached(broadcasterID, message.User.UserID); err == nil {
			isSubscriber, subscriberTier, subscribedMonths = resolveSubscriptionState(existingParticipant, subInfo, nil)
			logger.Debug("User subscription info retrieved",
				zap.String("user_id", message.User.UserID),
				zap.String("tier", subInfo.Tier),
				zap.Int("api_cumulative_months", subInfo.CumulativeMonths),
				zap.Int("resolved_cumulative_months", subscribedMonths),
				zap.Bool("is_gift", subInfo.IsGift))
		} else {
			isSubscriber, subscriberTier, subscribedMonths = resolveSubscriptionState(existingParticipant, nil, err)
			if errors.Is(err, twitchapi.ErrUserNotSubscribed) {
				logger.Debug("User is not subscribed",
					zap.String("user_id", message.User.UserID))
			} else {
				logger.Warn("Failed to get subscription info, keep existing subscription values",
					zap.String("user_id", message.User.UserID),
					zap.Bool("is_subscriber", isSubscriber),
					zap.String("subscriber_tier", subscriberTier),
					zap.Int("subscribed_months", subscribedMonths),
					zap.Error(err))
			}
		}
	}

	// 参加者情報を作成
	participant := types.PresentParticipant{
		UserID:           message.User.UserID,
		Username:         message.User.UserLogin,
		DisplayName:      message.User.UserName,
		AvatarURL:        avatarURL,
		RedeemedAt:       time.Now(),
		IsSubscriber:     isSubscriber,
		SubscribedMonths: subscribedMonths,
		SubscriberTier:   subscriberTier,
		EntryCount:       1,
		AssignedColor:    "",
	}

	// DBに保存
	if err := localdb.AddLotteryParticipant(participant); err != nil {
		logger.Error("Failed to add lottery participant to database",
			zap.Error(err),
			zap.String("user_id", message.User.UserID),
			zap.String("username", message.User.UserLogin))
		return
	}

	// データベースから最新の参加者情報を取得（entry_countが正しく加算された状態）
	allParticipants, err := localdb.GetAllLotteryParticipants()
	if err != nil {
		logger.Error("Failed to get lottery participants after add", zap.Error(err))
		return
	}

	var updatedParticipant *types.PresentParticipant
	for i := range allParticipants {
		if allParticipants[i].UserID == participant.UserID {
			updatedParticipant = &allParticipants[i]
			break
		}
	}

	if updatedParticipant != nil {
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

func loadExistingLotteryParticipant(userID string) (*types.PresentParticipant, error) {
	participants, err := localdb.GetAllLotteryParticipants()
	if err != nil {
		return nil, err
	}

	for i := range participants {
		if participants[i].UserID == userID {
			p := participants[i]
			return &p, nil
		}
	}

	return nil, nil
}

func resolveSubscriptionState(existing *types.PresentParticipant, subInfo *twitchapi.UserSubscription, fetchErr error) (bool, string, int) {
	isSubscriber := false
	subscriberTier := ""
	subscribedMonths := 0
	if existing != nil {
		isSubscriber = existing.IsSubscriber
		subscriberTier = existing.SubscriberTier
		subscribedMonths = existing.SubscribedMonths
	}

	if fetchErr == nil {
		if subInfo != nil {
			return true, subInfo.Tier, twitchapi.ResolveSubscribedMonths(subInfo.CumulativeMonths, subscribedMonths)
		}
		return isSubscriber, subscriberTier, subscribedMonths
	}

	if errors.Is(fetchErr, twitchapi.ErrUserNotSubscribed) {
		return false, "", 0
	}

	return isSubscriber, subscriberTier, subscribedMonths
}

// printRewardMessage はリワードメッセージをフラグメント解析してプリンター出力する
func printRewardMessage(message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd) {
	// ユーザー入力をエモート対応フラグメントに解析する
	fragments := ParseUserInputToFragments(message.UserInput)

	// フラグメントがない場合はテキストのみのフラグメントを作成する
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

	// デバッグ用にフラグメント詳細をログに記録する
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

	// エモートとアバター付きでメッセージを印刷する
	output.PrintOut(message.User.UserName, fragments, avatarURL, time.Now())

	logger.Info("チャネポ処理完了",
		zap.String("user", message.User.UserName),
		zap.String("reward", message.Reward.Title),
		zap.String("userInput", message.UserInput),
		zap.Int("fragments", len(fragments)),
		zap.String("avatar_url", avatarURL))
}
