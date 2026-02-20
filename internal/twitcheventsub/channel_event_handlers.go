package twitcheventsub

import (
	"fmt"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/notification"
	"github.com/ichi0g0y/twitch-overlay/internal/output"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/joeyak/go-twitch-eventsub/v3"
	"go.uber.org/zap"
)

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
