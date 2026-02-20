package webserver

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

type lotterySettingsUpdateRequest struct {
	RewardID          *string `json:"reward_id"`
	LastWinner        *string `json:"last_winner"`
	BaseTicketsLimit  *int    `json:"base_tickets_limit"`
	FinalTicketsLimit *int    `json:"final_tickets_limit"`
}

// handleLotteryDraw は /api/lottery/draw から抽選を実行する互換エンドポイント。
// 既存の抽選停止処理を流用し、抽選開始中かどうかに関わらず1回抽選を行う。
func handleLotteryDraw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	lotteryStopMu.Lock()
	defer lotteryStopMu.Unlock()

	result, err := executePresentStop()
	if err != nil {
		handlePresentStopError(w, err)
		return
	}

	broadcastPresentStop(result)
	writePresentStopResponse(w, result)
}

// handleLotterySettings は抽選設定の取得・更新を処理する。
func handleLotterySettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleGetLotterySettings(w)
	case http.MethodPut:
		handlePutLotterySettings(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGetLotterySettings(w http.ResponseWriter) {
	settings, err := localdb.GetLotterySettings()
	if err != nil {
		logger.Error("Failed to get lottery settings", zap.Error(err))
		http.Error(w, "Failed to get lottery settings", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(settings)
}

func handlePutLotterySettings(w http.ResponseWriter, r *http.Request) {
	var req lotterySettingsUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	settings, err := localdb.GetLotterySettings()
	if err != nil {
		logger.Error("Failed to load current lottery settings", zap.Error(err))
		http.Error(w, "Failed to get lottery settings", http.StatusInternalServerError)
		return
	}

	if req.RewardID != nil {
		settings.RewardID = strings.TrimSpace(*req.RewardID)
	}
	if req.LastWinner != nil {
		settings.LastWinner = strings.TrimSpace(*req.LastWinner)
	}
	if req.BaseTicketsLimit != nil {
		if *req.BaseTicketsLimit <= 0 {
			http.Error(w, "base_tickets_limit must be greater than 0", http.StatusBadRequest)
			return
		}
		settings.BaseTicketsLimit = *req.BaseTicketsLimit
	}
	if req.FinalTicketsLimit != nil {
		if *req.FinalTicketsLimit < 0 {
			http.Error(w, "final_tickets_limit must be greater than or equal to 0", http.StatusBadRequest)
			return
		}
		settings.FinalTicketsLimit = *req.FinalTicketsLimit
	}

	if err := localdb.UpdateLotterySettings(*settings); err != nil {
		logger.Error("Failed to update lottery settings", zap.Error(err))
		http.Error(w, "Failed to update lottery settings", http.StatusInternalServerError)
		return
	}

	updated, err := localdb.GetLotterySettings()
	if err != nil {
		logger.Error("Failed to reload lottery settings", zap.Error(err))
		http.Error(w, "Failed to get lottery settings", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(updated)
}

// handleLotteryResetWinner は前回当選者をリセットする。
func handleLotteryResetWinner(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := localdb.ResetLastWinner(); err != nil {
		logger.Error("Failed to reset last winner", zap.Error(err))
		http.Error(w, "Failed to reset last winner", http.StatusInternalServerError)
		return
	}

	if currentLottery.Winner != nil {
		currentLottery.Winner = nil
	}

	BroadcastWSMessage("lottery_winner_reset", map[string]interface{}{
		"last_winner": "",
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Last winner reset",
	})
}

// handleLotteryHistory は抽選履歴一覧の取得を処理する。
func handleLotteryHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := 0
	limitRaw := strings.TrimSpace(r.URL.Query().Get("limit"))
	if limitRaw != "" {
		parsed, err := strconv.Atoi(limitRaw)
		if err != nil || parsed < 0 {
			http.Error(w, "Invalid limit", http.StatusBadRequest)
			return
		}
		limit = parsed
	}

	history, err := localdb.GetLotteryHistory(limit)
	if err != nil {
		logger.Error("Failed to get lottery history", zap.Error(err))
		http.Error(w, "Failed to get lottery history", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"history": history,
	})
}

// handleLotteryHistoryItem は抽選履歴1件の削除を処理する。
func handleLotteryHistoryItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	historyIDRaw := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/api/lottery/history/"))
	if historyIDRaw == "" || strings.Contains(historyIDRaw, "/") {
		http.Error(w, "Invalid history ID", http.StatusBadRequest)
		return
	}

	historyID, err := strconv.Atoi(historyIDRaw)
	if err != nil || historyID <= 0 {
		http.Error(w, "Invalid history ID", http.StatusBadRequest)
		return
	}

	if err := localdb.DeleteLotteryHistory(historyID); err != nil {
		logger.Error("Failed to delete lottery history", zap.Error(err), zap.Int("history_id", historyID))
		http.Error(w, "Failed to delete lottery history", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"id":      historyID,
	})
}
