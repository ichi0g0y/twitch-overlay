package twitcheventsub

import (
	"fmt"
	"time"

	"github.com/joeyak/go-twitch-eventsub/v3"
	"github.com/nantokaworks/twitch-overlay/internal/broadcast"
	"github.com/nantokaworks/twitch-overlay/internal/env"
	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/notification"
	"github.com/nantokaworks/twitch-overlay/internal/output"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/twitchapi"
	"go.uber.org/zap"
)

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
		logger.Debug("Skipping channel point redemption in chat message handler",
			zap.String("user", message.Chatter.ChatterUserName),
			zap.String("rewardId", message.ChannelPointsCustomRewardId))
		// Note: 通知はHandleChannelPointsCustomRedemptionAddで行う
		return
	}

	// フラグメント情報を構築（通知用）
	fragments := buildFragmentsForNotification(message.Message.Fragments)

	// 通知をキューに追加（フラグメント付き）
	notification.EnqueueNotificationWithFragments(
		message.Chatter.ChatterUserName,
		message.Message.Text,
		fragments,
	)

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

func HandleChannelPointsCustomRedemptionAdd(message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd) {
	// リワードカウントを増やす（全てのリワードをカウント）
	// ユーザー名も記録する
	if err := localdb.IncrementRewardCount(message.Reward.ID, message.User.UserName); err != nil {
		logger.Error("Failed to increment reward count", zap.Error(err), zap.String("reward_id", message.Reward.ID), zap.String("user_name", message.User.UserName))
	} else {
		// カウント更新をbroadcastで通知
		count, err := localdb.GetRewardCount(message.Reward.ID)
		if err == nil {
			// リワードのタイトルを含める
			count.Title = message.Reward.Title
			broadcast.Send(map[string]interface{}{
				"type": "reward_count_updated",
				"data": count,
			})
		}
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

	// Print the message with emotes
	output.PrintOut(message.User.UserName, fragments, time.Now())

	logger.Info("チャネポ処理完了",
		zap.String("user", message.User.UserName),
		zap.String("reward", message.Reward.Title),
		zap.String("userInput", message.UserInput),
		zap.Int("fragments", len(fragments)))
}

func HandleChannelCheer(message twitch.EventChannelCheer) {
	title := "ビッツありがとう :)"
	userName := message.User.UserName
	details := fmt.Sprintf("%d ビッツ", message.Bits)

	output.PrintOutWithTitle(title, userName, "", details, time.Now())

	// 通知をキューに追加
	notificationMessage := fmt.Sprintf("%s - %d ビッツ", title, message.Bits)
	notification.EnqueueNotification(userName, notificationMessage)
}
func HandleChannelFollow(message twitch.EventChannelFollow) {
	title := "フォローありがとう :)"
	userName := message.User.UserName
	details := "" // フォローの場合は詳細なし

	output.PrintOutWithTitle(title, userName, "", details, time.Now())

	// 通知をキューに追加
	notification.EnqueueNotification(userName, title)
}
func HandleChannelRaid(message twitch.EventChannelRaid) {
	title := "レイドありがとう :)"
	userName := message.FromBroadcasterUserName
	details := fmt.Sprintf("%d 人", message.Viewers)

	output.PrintOutWithTitle(title, userName, "", details, time.Now())

	// 通知をキューに追加
	notificationMessage := fmt.Sprintf("%s - %d 人", title, message.Viewers)
	notification.EnqueueNotification(userName, notificationMessage)
}
func HandleChannelShoutoutReceive(message twitch.EventChannelShoutoutReceive) {
	title := "応援ありがとう :)"
	userName := message.FromBroadcasterUserName
	details := "" // シャウトアウトの場合は詳細なし

	output.PrintOutWithTitle(title, userName, "", details, time.Now())

	// 通知をキューに追加
	notification.EnqueueNotification(userName, title)
}
func HandleChannelSubscribe(message twitch.EventChannelSubscribe) {
	if !message.IsGift {
		title := "サブスクありがとう :)"
		userName := message.User.UserName
		details := fmt.Sprintf("Tier %s", message.Tier)

		output.PrintOutWithTitle(title, userName, "", details, time.Now())

		// 通知をキューに追加
		notificationMessage := fmt.Sprintf("%s - Tier %s", title, message.Tier)
		notification.EnqueueNotification(userName, notificationMessage)
	} else {
		title := "サブギフおめです :)"
		userName := message.User.UserName
		details := fmt.Sprintf("Tier %s", message.Tier)

		output.PrintOutWithTitle(title, userName, "", details, time.Now())

		// 通知をキューに追加
		notificationMessage := fmt.Sprintf("%s - Tier %s", title, message.Tier)
		notification.EnqueueNotification(userName, notificationMessage)
	}
}

func HandleChannelSubscriptionGift(message twitch.EventChannelSubscriptionGift) {
	title := "サブギフありがとう :)"

	if !message.IsAnonymous {
		userName := message.User.UserName
		details := fmt.Sprintf("Tier %s | %d個", message.Tier, message.Total)
		output.PrintOutWithTitle(title, userName, "", details, time.Now())

		// 通知をキューに追加
		notificationMessage := fmt.Sprintf("%s - Tier %s | %d個", title, message.Tier, message.Total)
		notification.EnqueueNotification(userName, notificationMessage)
	} else {
		userName := "匿名さん"
		details := fmt.Sprintf("Tier %s | %d個", message.Tier, message.Total)
		output.PrintOutWithTitle(title, userName, "", details, time.Now())

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
	output.PrintOutWithTitle(title, userName, extra, details, time.Now())

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
	notification.EnqueueNotification(userName, notificationMessage)

	logger.Info("サブスクメッセージ",
		zap.String("user", message.User.UserName),
		zap.Int("cumulative_months", message.CumulativeMonths),
		zap.Int("streak_months", message.StreakMonths),
		zap.String("tier", message.Tier),
		zap.String("message", message.Message.Text))
}
