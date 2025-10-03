package twitcheventsub

import (
	"fmt"
	"time"

	"github.com/joeyak/go-twitch-eventsub/v3"
	"github.com/nantokaworks/twitch-overlay/internal/env"
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
		return
	}
	// 通常のチャットメッセージの処理（必要に応じて実装）
}

func HandleChannelPointsCustomRedemptionAdd(message twitch.EventChannelChannelPointsCustomRewardRedemptionAdd) {
	if message.Reward.ID != *env.Value.TriggerCustomRewordID {
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
}
func HandleChannelFollow(message twitch.EventChannelFollow) {
	title := "フォローありがとう :)"
	userName := message.User.UserName
	details := "" // フォローの場合は詳細なし

	output.PrintOutWithTitle(title, userName, "", details, time.Now())
}
func HandleChannelRaid(message twitch.EventChannelRaid) {
	title := "レイドありがとう :)"
	userName := message.FromBroadcasterUserName
	details := fmt.Sprintf("%d 人", message.Viewers)

	output.PrintOutWithTitle(title, userName, "", details, time.Now())
}
func HandleChannelShoutoutReceive(message twitch.EventChannelShoutoutReceive) {
	title := "応援ありがとう :)"
	userName := message.FromBroadcasterUserName
	details := "" // シャウトアウトの場合は詳細なし

	output.PrintOutWithTitle(title, userName, "", details, time.Now())
}
func HandleChannelSubscribe(message twitch.EventChannelSubscribe) {
	if !message.IsGift {
		title := "サブスクありがとう :)"
		userName := message.User.UserName
		details := fmt.Sprintf("Tier %s", message.Tier)

		output.PrintOutWithTitle(title, userName, "", details, time.Now())
	} else {
		title := "サブギフおめです :)"
		userName := message.User.UserName
		details := fmt.Sprintf("Tier %s", message.Tier)

		output.PrintOutWithTitle(title, userName, "", details, time.Now())
	}
}

func HandleChannelSubscriptionGift(message twitch.EventChannelSubscriptionGift) {
	title := "サブギフありがとう :)"

	if !message.IsAnonymous {
		userName := message.User.UserName
		details := fmt.Sprintf("Tier %s | %d個", message.Tier, message.Total)
		output.PrintOutWithTitle(title, userName, "", details, time.Now())
	} else {
		userName := "匿名さん"
		details := fmt.Sprintf("Tier %s | %d個", message.Tier, message.Total)
		output.PrintOutWithTitle(title, userName, "", details, time.Now())
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

	logger.Info("サブスクメッセージ",
		zap.String("user", message.User.UserName),
		zap.Int("cumulative_months", message.CumulativeMonths),
		zap.Int("streak_months", message.StreakMonths),
		zap.String("tier", message.Tier),
		zap.String("message", message.Message.Text))
}
