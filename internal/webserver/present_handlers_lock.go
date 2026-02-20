package webserver

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchtoken"
	"go.uber.org/zap"
)

// handlePresentLock はルーレットをロック（Twitchリワードを無効化）
func handlePresentLock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	settingsManager, rewardID, broadcasterID, accessToken, err := loadLotteryLockContext()
	if err != nil {
		handleLotteryLockContextError(w, err)
		return
	}

	if err := twitchapi.UpdateCustomRewardEnabled(broadcasterID, rewardID, false, accessToken); err != nil {
		logger.Error("Failed to disable reward via Twitch API",
			zap.String("reward_id", rewardID),
			zap.Error(err))
		http.Error(w, "Failed to disable reward", http.StatusInternalServerError)
		return
	}

	if err := settingsManager.SetSetting("LOTTERY_LOCKED", "true"); err != nil {
		logger.Error("Failed to save LOTTERY_LOCKED setting", zap.Error(err))
	}

	currentLottery.IsLocked = true
	logger.Info("Lottery locked (reward disabled via Twitch API)", zap.String("reward_id", rewardID))

	BroadcastWSMessage("lottery_locked", map[string]interface{}{
		"is_locked": true,
		"locked_at": time.Now(),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Lottery locked",
	})
}

// handlePresentUnlock はルーレットをロック解除（Twitchリワードを有効化）
func handlePresentUnlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	settingsManager, rewardID, broadcasterID, accessToken, err := loadLotteryLockContext()
	if err != nil {
		handleLotteryLockContextError(w, err)
		return
	}

	if err := twitchapi.UpdateCustomRewardEnabled(broadcasterID, rewardID, true, accessToken); err != nil {
		logger.Error("Failed to enable reward via Twitch API",
			zap.String("reward_id", rewardID),
			zap.Error(err))
		http.Error(w, "Failed to enable reward", http.StatusInternalServerError)
		return
	}

	if err := settingsManager.SetSetting("LOTTERY_LOCKED", "false"); err != nil {
		logger.Error("Failed to save LOTTERY_LOCKED setting", zap.Error(err))
	}

	currentLottery.IsLocked = false
	logger.Info("Lottery unlocked (reward enabled via Twitch API)", zap.String("reward_id", rewardID))

	BroadcastWSMessage("lottery_unlocked", map[string]interface{}{
		"is_locked":   false,
		"unlocked_at": time.Now(),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Lottery unlocked",
	})
}

func loadLotteryLockContext() (*settings.SettingsManager, string, string, string, error) {
	db := localdb.GetDB()
	if db == nil {
		return nil, "", "", "", errDatabaseNotInitialized
	}

	settingsManager := settings.NewSettingsManager(db)
	rewardID, err := settingsManager.GetRealValue("LOTTERY_REWARD_ID")
	if err != nil || rewardID == "" {
		return nil, "", "", "", errLotteryRewardNotConfigured
	}

	broadcasterID, err := settingsManager.GetRealValue("TWITCH_USER_ID")
	if err != nil || broadcasterID == "" {
		return nil, "", "", "", errTwitchUserIDNotConfigured
	}

	token, valid, err := twitchtoken.GetLatestToken()
	if err != nil || !valid {
		logger.Error("Failed to get valid token for lottery lock operation", zap.Error(err))
		return nil, "", "", "", errInvalidToken
	}

	return settingsManager, rewardID, broadcasterID, token.AccessToken, nil
}

var (
	errDatabaseNotInitialized     = &lotteryLockContextError{message: "Database not initialized", status: http.StatusInternalServerError}
	errLotteryRewardNotConfigured = &lotteryLockContextError{message: "LOTTERY_REWARD_ID not configured", status: http.StatusBadRequest}
	errTwitchUserIDNotConfigured  = &lotteryLockContextError{message: "TWITCH_USER_ID not configured", status: http.StatusBadRequest}
	errInvalidToken               = &lotteryLockContextError{message: "Failed to get valid token", status: http.StatusInternalServerError}
)

type lotteryLockContextError struct {
	message string
	status  int
}

func (e *lotteryLockContextError) Error() string {
	return e.message
}

func handleLotteryLockContextError(w http.ResponseWriter, err error) {
	if ctxErr, ok := err.(*lotteryLockContextError); ok {
		http.Error(w, ctxErr.message, ctxErr.status)
		return
	}

	http.Error(w, "Failed to prepare lock context", http.StatusInternalServerError)
}
