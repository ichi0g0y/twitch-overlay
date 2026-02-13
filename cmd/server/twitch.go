package main

import (
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/twitcheventsub"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchtoken"
	"go.uber.org/zap"
)

func startTwitchBackground(tokenRefreshDone <-chan struct{}) {
	if env.Value.ClientID == nil || env.Value.ClientSecret == nil {
		return
	}
	if *env.Value.ClientID == "" || *env.Value.ClientSecret == "" {
		return
	}

	token, isValid, err := twitchtoken.GetOrRefreshToken()
	if err != nil || !isValid || token.AccessToken == "" {
		return
	}

	logger.Info("Valid Twitch token found or refreshed, starting EventSub and token refresh goroutine")

	go func() {
		if err := twitcheventsub.Start(); err != nil {
			logger.Error("Failed to start EventSub", zap.Error(err))
			return
		}

		// EventSub does not detect existing live streams; fetch explicitly once.
		time.Sleep(2 * time.Second)
		checkInitialStreamStatus()
	}()

	go refreshTokenPeriodically(tokenRefreshDone)
}

func sleepOrDone(done <-chan struct{}, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-done:
		return false
	case <-timer.C:
		return true
	}
}

func refreshTokenPeriodically(done <-chan struct{}) {
	logger.Info("Starting token refresh goroutine")

	for {
		select {
		case <-done:
			logger.Info("Stopping token refresh goroutine")
			return
		default:
		}

		token, _, err := twitchtoken.GetLatestToken()
		if err != nil {
			if !sleepOrDone(done, 1*time.Minute) {
				return
			}
			continue
		}

		now := time.Now().Unix()
		timeUntilExpiry := token.ExpiresAt - now

		switch {
		case timeUntilExpiry <= 0:
			logger.Info("Token has expired, refreshing immediately")
			if err := token.RefreshTwitchToken(); err != nil {
				logger.Error("Failed to refresh expired token", zap.Error(err))
				if !sleepOrDone(done, 5*time.Minute) {
					return
				}
				continue
			}
			logger.Info("Token refreshed successfully")
			restartEventSub()

		case timeUntilExpiry <= 30*60:
			logger.Info("Token expires in less than 30 minutes, refreshing now",
				zap.Int64("seconds_until_expiry", timeUntilExpiry))
			if err := token.RefreshTwitchToken(); err != nil {
				logger.Error("Failed to refresh token", zap.Error(err))
				if !sleepOrDone(done, 5*time.Minute) {
					return
				}
				continue
			}
			logger.Info("Token refreshed successfully")
			restartEventSub()

		default:
			sleepDuration := time.Duration(timeUntilExpiry-30*60) * time.Second
			if sleepDuration > time.Hour {
				sleepDuration = time.Hour
			}
			logger.Debug("Next token refresh check",
				zap.Duration("sleep_duration", sleepDuration),
				zap.Int64("seconds_until_expiry", timeUntilExpiry))
			if !sleepOrDone(done, sleepDuration) {
				return
			}
		}
	}
}

func restartEventSub() {
	logger.Info("Restarting EventSub after token refresh")

	twitcheventsub.Stop()
	time.Sleep(1 * time.Second)

	if err := twitcheventsub.Start(); err != nil {
		logger.Error("Failed to restart EventSub", zap.Error(err))
		return
	}

	logger.Info("EventSub restarted successfully")
}

