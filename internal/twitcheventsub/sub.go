package twitcheventsub

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/joeyak/go-twitch-eventsub/v3"
	"github.com/nantokaworks/twitch-overlay/internal/env"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/status"
	"github.com/nantokaworks/twitch-overlay/internal/twitchapi"
	"github.com/nantokaworks/twitch-overlay/internal/twitchtoken"
	"go.uber.org/zap"
)

var (
	client *twitch.Client
	shutdownChan = make(chan struct{})
	isRunning    bool
	isConnected  bool
	lastError    error
)

// Start starts the EventSub client
func Start() error {
	if isRunning {
		return nil
	}

	token, valid, err := twitchtoken.GetLatestToken()
	if err != nil {
		return fmt.Errorf("failed to get token: %w", err)
	}

	if token.AccessToken == "" {
		return fmt.Errorf("no access token available")
	}

	// トークンの有効期限をチェック
	if !valid {
		logger.Info("Token expired or about to expire, refreshing...")
		if err := token.RefreshTwitchToken(); err != nil {
			return fmt.Errorf("failed to refresh token: %w", err)
		}
		// リフレッシュ後のトークンを再取得
		token, _, err = twitchtoken.GetLatestToken()
		if err != nil {
			return fmt.Errorf("failed to get refreshed token: %w", err)
		}
		logger.Info("Token refreshed successfully")
	} else {
		// 期限が30分以内の場合も事前にリフレッシュ
		now := time.Now().Unix()
		timeUntilExpiry := token.ExpiresAt - now
		if timeUntilExpiry <= 30*60 {
			logger.Info("Token expires in less than 30 minutes, refreshing proactively...",
				zap.Int64("seconds_until_expiry", timeUntilExpiry))
			if err := token.RefreshTwitchToken(); err != nil {
				logger.Warn("Failed to refresh token proactively", zap.Error(err))
				// リフレッシュに失敗しても、まだ有効なトークンがあるので続行
			} else {
				// リフレッシュ後のトークンを再取得
				token, _, err = twitchtoken.GetLatestToken()
				if err != nil {
					logger.Warn("Failed to get refreshed token", zap.Error(err))
				} else {
					logger.Info("Token refreshed proactively")
				}
			}
		}
	}

	SetupEventSub(&token)
	
	if client != nil {
		go func() {
			logger.Info("Connecting to EventSub...")
			if err := client.Connect(); err != nil {
				logger.Error("Failed to connect EventSub", zap.Error(err))
				lastError = err
				isConnected = false
			}
		}()
		isRunning = true
	}
	
	return nil
}

// Stop stops the EventSub client
func Stop() {
	if client != nil && isRunning {
		client.Close()
		isRunning = false
		isConnected = false
	}
}

// IsConnected returns whether EventSub is connected
func IsConnected() bool {
	return isConnected
}

// GetLastError returns the last EventSub error
func GetLastError() error {
	return lastError
}

func SetupEventSub(token *twitchtoken.Token) {
	client = twitch.NewClient()

	client.OnError(func(err error) {
		logger.Error("EventSub error", zap.Error(err))
		lastError = err
		isConnected = false
	})
	client.OnWelcome(func(message twitch.WelcomeMessage) {
		logger.Info("EventSub connected successfully")
		isConnected = true
		lastError = nil

		// EventSub接続成功時に現在の配信状態を確認
		// EventSubは既存の配信をstream.onlineイベントとして通知しないため
		go checkStreamStatusOnConnect()

		events := []twitch.EventSubscription{
			twitch.SubChannelChannelPointsCustomRewardRedemptionAdd,
			twitch.SubChannelCheer,
			twitch.SubChannelFollow,
			twitch.SubChannelRaid,
			twitch.SubChannelChatMessage,
			twitch.SubChannelShoutoutReceive,
			twitch.SubChannelSubscribe,
			twitch.SubChannelSubscriptionGift,
			twitch.SubChannelSubscriptionMessage,
			twitch.SubStreamOffline,
			twitch.SubStreamOnline,
		}

		for _, event := range events {
			logger.Info("Subscribing to EventSub event", zap.String("event", string(event)))

			_, err := twitch.SubscribeEvent(twitch.SubscribeRequest{
				SessionID:   message.Payload.Session.ID,
				ClientID:    *env.Value.ClientID,
				AccessToken: token.AccessToken,
				Event:       event,
				Condition: map[string]string{
					"broadcaster_user_id":    *env.Value.TwitchUserID,
					"to_broadcaster_user_id": *env.Value.TwitchUserID,
					"moderator_user_id":      *env.Value.TwitchUserID,
					"user_id":                *env.Value.TwitchUserID,
				},
			})
			if err != nil {
				logger.Error("Failed to subscribe to event", 
					zap.String("event", string(event)),
					zap.Error(err))
				// エラーが発生しても他のイベントのサブスクリプションを続ける
				continue
			}
			logger.Info("Successfully subscribed to event", zap.String("event", string(event)))
		}
	})
	client.OnNotification(func(message twitch.NotificationMessage) {

		rawJson := string(*message.Payload.Event)
		logger.Debug("Received EventSub notification",
			zap.String("type", string(message.Payload.Subscription.Type)),
			zap.String("data", rawJson))

		switch message.Payload.Subscription.Type {

		// use channel chat message
		case twitch.SubChannelChatMessage:
			var evt twitch.EventChannelChatMessage
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse channel chat message event", zap.Error(err))
			} else {
				HandleChannelChatMessage(evt)
			}

		// use channel point
		case twitch.SubChannelChannelPointsCustomRewardRedemptionAdd:
			var evt twitch.EventChannelChannelPointsCustomRewardRedemptionAdd
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse channel points custom reward event", zap.Error(err))
			} else {
				HandleChannelPointsCustomRedemptionAdd(evt)
			}

		// use cheer
		case twitch.SubChannelCheer:
			var evt twitch.EventChannelCheer
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse cheer event", zap.Error(err))
			} else {
				HandleChannelCheer(evt)
			}

		// use follow
		case twitch.SubChannelFollow:
			var evt twitch.EventChannelFollow
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse follow event", zap.Error(err))
			} else {
				HandleChannelFollow(evt)
			}

		// use raid
		case twitch.SubChannelRaid:
			var evt twitch.EventChannelRaid
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse raid event", zap.Error(err))
			} else {
				HandleChannelRaid(evt)
			}

		// use shoutout
		case twitch.SubChannelShoutoutReceive:
			var evt twitch.EventChannelShoutoutReceive
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse shoutout event", zap.Error(err))
			} else {
				HandleChannelShoutoutReceive(evt)
			}

		// use subscribe
		case twitch.SubChannelSubscribe:
			var evt twitch.EventChannelSubscribe
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse subscribe event", zap.Error(err))
			} else {
				HandleChannelSubscribe(evt)
			}

		// use subscribe gift
		case twitch.SubChannelSubscriptionGift:
			var evt twitch.EventChannelSubscriptionGift
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse subscription gift event", zap.Error(err))
			} else {
				HandleChannelSubscriptionGift(evt)
			}

		// use subscription message (for resubs)
		case twitch.SubChannelSubscriptionMessage:
			var evt twitch.EventChannelSubscriptionMessage
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse subscription message event", zap.Error(err))
			} else {
				HandleChannelSubscriptionMessage(evt)
			}

		// use stream offline
		case twitch.SubStreamOffline:
			var evt twitch.EventStreamOffline
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse stream offline event", zap.Error(err))
			} else {
				HandleStreamOffline(evt)
			}

		// use stream online
		case twitch.SubStreamOnline:
			var evt twitch.EventStreamOnline
			if err := json.Unmarshal(*message.Payload.Event, &evt); err != nil {
				logger.Error("Failed to parse stream online event", zap.Error(err))
			} else {
				HandleStreamOnline(evt)
			}

		default:
			logger.Debug("Unhandled EventSub notification",
				zap.String("type", string(message.Payload.Subscription.Type)),
				zap.String("data", string(*message.Payload.Event)))
		}
	})
	client.OnKeepAlive(func(message twitch.KeepAliveMessage) {
		// EventSubのKeepAliveを受信 - 接続は正常
		isConnected = true
	})
	client.OnRevoke(func(message twitch.RevokeMessage) {
		logger.Warn("EventSub subscription revoked", 
			zap.String("type", string(message.Payload.Subscription.Type)),
			zap.String("status", message.Payload.Subscription.Status))
	})
	client.OnRawEvent(func(event string, metadata twitch.MessageMetadata, subscription twitch.PayloadSubscription) {
		fmt.Printf("RAW EVENT: %s\n", subscription.Type)
	})

	// Connect処理はStart()関数で行うため、ここでは接続しない
}

// checkStreamStatusOnConnect checks the current stream status when EventSub connects
func checkStreamStatusOnConnect() {
	logger.Info("Checking stream status after EventSub connection...")

	// Twitchユーザーが設定されているか確認
	if env.Value.TwitchUserID == nil || *env.Value.TwitchUserID == "" {
		logger.Warn("Cannot check stream status: Twitch user ID not configured")
		return
	}

	// 少し待ってからAPIを呼び出す（EventSubのサブスクリプション処理を優先）
	time.Sleep(1 * time.Second)

	// 現在の配信状態をAPIで取得
	streamInfo, err := twitchapi.GetStreamInfo()
	if err != nil {
		logger.Error("Failed to get stream status on EventSub connect", zap.Error(err))
		return
	}

	if streamInfo.IsLive {
		logger.Info("Stream is currently LIVE (checked on EventSub connect)",
			zap.Int("viewer_count", streamInfo.ViewerCount))

		// 配信状態を更新
		// EventSubからstream.onlineイベントが来ていない場合のみ更新
		currentStatus := status.GetStreamStatus()
		if !currentStatus.IsLive {
			logger.Info("Updating stream status to LIVE (was not detected by EventSub)")
			status.UpdateStreamStatus(true, nil, streamInfo.ViewerCount)

			// AUTO_DRY_RUN_WHEN_OFFLINEの状態をログ出力
			if env.Value.AutoDryRunWhenOffline {
				logger.Info("AUTO_DRY_RUN_WHEN_OFFLINE: Stream is now LIVE - dry-run mode disabled")
			}
		} else {
			logger.Info("Stream status already set to LIVE by EventSub")
		}
	} else {
		logger.Info("Stream is OFFLINE (checked on EventSub connect)")

		// 明示的にオフライン状態を設定
		currentStatus := status.GetStreamStatus()
		if currentStatus.IsLive {
			logger.Info("Updating stream status to OFFLINE")
			status.SetStreamOffline()
		}

		// AUTO_DRY_RUN_WHEN_OFFLINEの状態をログ出力
		if env.Value.AutoDryRunWhenOffline {
			logger.Info("AUTO_DRY_RUN_WHEN_OFFLINE: Stream is OFFLINE - dry-run mode active")
		}
	}
}

// Shutdown closes the EventSub client connection
func Shutdown() {
	if client != nil {
		client.Close()
	}
}
