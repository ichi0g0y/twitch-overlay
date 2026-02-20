package webserver

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/lottery"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
	"go.uber.org/zap"
)

type presentStopResult struct {
	winner      *types.PresentParticipant
	winnerIndex int
	drawResult  *lottery.DrawResult
}

// handlePresentStop は抽選を停止
func handlePresentStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	lotteryStopMu.Lock()
	defer lotteryStopMu.Unlock()

	if !currentLottery.IsRunning {
		http.Error(w, "Lottery not running", http.StatusBadRequest)
		return
	}

	result, err := executePresentStop()
	if err != nil {
		handlePresentStopError(w, err)
		return
	}

	broadcastPresentStop(result)
	writePresentStopResponse(w, result)
}

func executePresentStop() (*presentStopResult, error) {
	settings, participants, err := loadDrawInputs()
	if err != nil {
		return nil, err
	}

	drawResult, err := lottery.DrawLottery(participants, lottery.DrawOptions{
		BaseTicketsLimit:  settings.BaseTicketsLimit,
		FinalTicketsLimit: settings.FinalTicketsLimit,
		LastWinner:        settings.LastWinner,
	})
	if err != nil {
		return nil, err
	}

	winner := drawResult.Winner
	if winner == nil {
		return nil, errors.New("failed to resolve winner")
	}

	currentLottery.IsRunning = false
	currentLottery.StartedAt = nil
	currentLottery.Winner = winner

	if err := updateLastWinner(settings, winner.Username); err != nil {
		logger.Warn("Failed to update lottery last winner", zap.Error(err))
	}
	if err := saveLotteryHistory(settings, drawResult, winner.Username); err != nil {
		logger.Warn("Failed to save lottery history", zap.Error(err))
	}

	winnerIndex := findWinnerIndex(currentLottery.Participants, winner.UserID)
	logger.Info("Lottery stopped with winner",
		zap.String("winner_user_id", winner.UserID),
		zap.String("winner_username", winner.Username),
		zap.Int("total_tickets", drawResult.TotalTickets))

	return &presentStopResult{
		winner:      winner,
		winnerIndex: winnerIndex,
		drawResult:  drawResult,
	}, nil
}

func loadDrawInputs() (*localdb.LotterySettings, []types.PresentParticipant, error) {
	settings, err := localdb.GetLotterySettings()
	if err != nil {
		logger.Error("Failed to get lottery settings", zap.Error(err))
		return nil, nil, err
	}

	latestParticipants, err := localdb.GetAllLotteryParticipants()
	if err != nil {
		logger.Error("Failed to load participants from database before draw", zap.Error(err))
		return nil, nil, err
	}
	currentLottery.Participants = latestParticipants

	return settings, latestParticipants, nil
}

func updateLastWinner(settings *localdb.LotterySettings, winnerUsername string) error {
	settings.LastWinner = winnerUsername
	return localdb.UpdateLotterySettings(*settings)
}

func saveLotteryHistory(settings *localdb.LotterySettings, drawResult *lottery.DrawResult, winnerUsername string) error {
	participantsDetailJSON, err := json.Marshal(drawResult.ParticipantsDetail)
	if err != nil {
		logger.Warn("Failed to marshal participants detail", zap.Error(err))
		participantsDetailJSON = []byte("[]")
	}

	rewardIDs := []string{}
	if strings.TrimSpace(settings.RewardID) != "" {
		rewardIDs = append(rewardIDs, settings.RewardID)
	}
	rewardIDsJSON, err := json.Marshal(rewardIDs)
	if err != nil {
		logger.Warn("Failed to marshal reward IDs", zap.Error(err))
		rewardIDsJSON = []byte("[]")
	}

	return localdb.SaveLotteryHistory(localdb.LotteryHistory{
		WinnerName:        winnerUsername,
		TotalParticipants: drawResult.TotalParticipants,
		TotalTickets:      drawResult.TotalTickets,
		ParticipantsJSON:  string(participantsDetailJSON),
		RewardIDsJSON:     string(rewardIDsJSON),
		DrawnAt:           time.Now(),
	})
}

func findWinnerIndex(participants []types.PresentParticipant, userID string) int {
	for i, participant := range participants {
		if participant.UserID == userID {
			return i
		}
	}
	return -1
}

func handlePresentStopError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, lottery.ErrNoEligibleUser):
		http.Error(w, "No eligible participants", http.StatusBadRequest)
	case errors.Is(err, lottery.ErrNoParticipants):
		http.Error(w, "No participants", http.StatusBadRequest)
	default:
		if err.Error() == "failed to resolve winner" {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		logger.Error("Failed to stop lottery", zap.Error(err))
		http.Error(w, "Failed to stop lottery", http.StatusInternalServerError)
	}
}

func broadcastPresentStop(result *presentStopResult) {
	BroadcastWSMessage("lottery_stopped", map[string]interface{}{
		"stopped_at": time.Now(),
	})
	BroadcastWSMessage("lottery_winner", map[string]interface{}{
		"winner":              result.winner,
		"winner_index":        result.winnerIndex,
		"total_participants":  result.drawResult.TotalParticipants,
		"total_tickets":       result.drawResult.TotalTickets,
		"participants_detail": result.drawResult.ParticipantsDetail,
	})
}

func writePresentStopResponse(w http.ResponseWriter, result *presentStopResult) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":             true,
		"message":             "Lottery stopped",
		"winner":              result.winner,
		"winner_index":        result.winnerIndex,
		"total_participants":  result.drawResult.TotalParticipants,
		"total_tickets":       result.drawResult.TotalTickets,
		"participants_detail": result.drawResult.ParticipantsDetail,
	})
}
