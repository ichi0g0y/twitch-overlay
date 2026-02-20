package webserver

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
	"go.uber.org/zap"
)

var errSubscriberDBNotInitialized = errors.New("database not initialized")

var getUserSubscriptionCached = twitchapi.GetUserSubscriptionCached

// handleRefreshSubscribers は全参加者のサブスク状況をTwitch APIから更新
func handleRefreshSubscribers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	broadcasterID, err := loadBroadcasterID()
	if err != nil {
		if errors.Is(err, errSubscriberDBNotInitialized) {
			http.Error(w, "Database not initialized", http.StatusInternalServerError)
			return
		}
		http.Error(w, "TWITCH_USER_ID not configured", http.StatusBadRequest)
		return
	}

	participants, err := localdb.GetAllLotteryParticipants()
	if err != nil {
		logger.Error("Failed to get lottery participants", zap.Error(err))
		http.Error(w, "Failed to get participants", http.StatusInternalServerError)
		return
	}

	if len(participants) == 0 {
		respondRefreshResult(w, "No participants to refresh", 0, []string{})
		return
	}

	updatedCount, colorReassignNeeded, failedUsers := refreshParticipantsSubscriptionInfo(participants, broadcasterID)
	participants = applyRefreshedParticipants(participants, colorReassignNeeded)
	currentLottery.Participants = participants

	BroadcastWSMessage("lottery_participants_updated", buildParticipantsUpdatePayload(currentLottery.Participants))
	logger.Info("Subscriber status refresh completed",
		zap.Int("total", len(participants)),
		zap.Int("updated", updatedCount),
		zap.Int("failed", len(failedUsers)),
		zap.Bool("color_reassigned", colorReassignNeeded))

	respondRefreshResult(w, "Subscriber status refreshed", updatedCount, failedUsers)
}

func loadBroadcasterID() (string, error) {
	db := localdb.GetDB()
	if db == nil {
		return "", errSubscriberDBNotInitialized
	}

	settingsManager := settings.NewSettingsManager(db)
	broadcasterID, err := settingsManager.GetRealValue("TWITCH_USER_ID")
	if err != nil || broadcasterID == "" {
		return "", errors.New("TWITCH_USER_ID not configured")
	}

	return broadcasterID, nil
}

func refreshParticipantsSubscriptionInfo(participants []types.PresentParticipant, broadcasterID string) (int, bool, []string) {
	updatedCount := 0
	colorReassignNeeded := false
	failedUsers := []string{}

	for i := range participants {
		updated, colorChanged, failed := refreshOneParticipantSubscription(&participants[i], broadcasterID)
		if updated {
			updatedCount++
		}
		if colorChanged {
			colorReassignNeeded = true
		}
		if failed {
			failedUsers = append(failedUsers, displayNameOrFallback(participants[i]))
		}
	}

	return updatedCount, colorReassignNeeded, failedUsers
}

func refreshOneParticipantSubscription(p *types.PresentParticipant, broadcasterID string) (bool, bool, bool) {
	if !isNumericUserID(p.UserID) {
		logger.Debug("Skipping non-numeric user_id", zap.String("user_id", p.UserID))
		return false, false, false
	}

	subInfo, err := getUserSubscriptionCached(broadcasterID, p.UserID)
	oldIsSubscriber := p.IsSubscriber
	oldTier := p.SubscriberTier
	oldMonths := p.SubscribedMonths

	if err != nil {
		if errors.Is(err, twitchapi.ErrUserNotSubscribed) {
			p.IsSubscriber = false
			p.SubscriberTier = ""
			p.SubscribedMonths = 0
			logger.Debug("User is not subscribed", zap.String("user_id", p.UserID))
		} else {
			logger.Warn("Failed to refresh user subscription info, keeping current values",
				zap.String("user_id", p.UserID),
				zap.Error(err))
			return false, false, true
		}
	} else {
		p.IsSubscriber = true
		p.SubscriberTier = subInfo.Tier
		p.SubscribedMonths = twitchapi.ResolveSubscribedMonths(subInfo.CumulativeMonths, oldMonths)
		logger.Debug("User subscription info retrieved",
			zap.String("user_id", p.UserID),
			zap.Int("api_cumulative_months", subInfo.CumulativeMonths),
			zap.Int("resolved_cumulative_months", p.SubscribedMonths),
			zap.String("tier", subInfo.Tier))
	}

	changed := oldIsSubscriber != p.IsSubscriber || oldTier != p.SubscriberTier || oldMonths != p.SubscribedMonths
	if !changed {
		return false, false, false
	}

	if err := localdb.UpdateLotteryParticipant(p.UserID, *p); err != nil {
		logger.Error("Failed to update participant", zap.String("user_id", p.UserID), zap.Error(err))
		return false, false, true
	}

	logger.Info("Participant subscription status updated",
		zap.String("user_id", p.UserID),
		zap.Bool("old_is_subscriber", oldIsSubscriber),
		zap.Bool("new_is_subscriber", p.IsSubscriber),
		zap.Int("old_subscribed_months", oldMonths),
		zap.Int("new_subscribed_months", p.SubscribedMonths))

	return true, oldIsSubscriber != p.IsSubscriber, false
}

func applyRefreshedParticipants(participants []types.PresentParticipant, colorReassignNeeded bool) []types.PresentParticipant {
	if !colorReassignNeeded {
		return participants
	}

	logger.Info("Reassigning colors due to subscription changes")

	latestParticipants, err := localdb.GetAllLotteryParticipants()
	if err != nil {
		logger.Error("Failed to reload participants for color reassignment", zap.Error(err))
		return participants
	}

	// 色割り当て関数が currentLottery.Participants を参照するため、先に更新する
	currentLottery.Participants = latestParticipants

	for i := range latestParticipants {
		latestParticipants[i].AssignedColor = assignColorToParticipant(latestParticipants[i])
		if err := localdb.UpdateLotteryParticipant(latestParticipants[i].UserID, latestParticipants[i]); err != nil {
			logger.Warn("Failed to update participant color in database",
				zap.String("user_id", latestParticipants[i].UserID),
				zap.Error(err))
		}
	}

	return latestParticipants
}

func isNumericUserID(userID string) bool {
	if len(userID) == 0 {
		return false
	}
	for _, c := range userID {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func respondRefreshResult(w http.ResponseWriter, message string, updated int, failedUsers []string) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"message":      message,
		"updated":      updated,
		"failed_users": failedUsers,
	})
}

func displayNameOrFallback(p types.PresentParticipant) string {
	if p.DisplayName != "" {
		return p.DisplayName
	}
	if p.Username != "" {
		return p.Username
	}
	return p.UserID
}
