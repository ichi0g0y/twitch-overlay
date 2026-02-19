package webserver

import (
	"encoding/json"
	"net/http"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
	"go.uber.org/zap"
)

// handlePresentParticipant は個別参加者の削除・更新を処理
func handlePresentParticipant(w http.ResponseWriter, r *http.Request) {
	// URLからユーザーIDを取得
	userID := r.URL.Path[len("/api/present/participants/"):]
	if userID == "" {
		http.Error(w, "User ID is required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodDelete:
		handleDeleteParticipant(w, userID)
	case http.MethodPut:
		handleUpdateParticipant(w, r, userID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleDeleteParticipant は特定の参加者を削除
func handleDeleteParticipant(w http.ResponseWriter, userID string) {
	// 参加者を探して削除
	found := false
	for i, p := range currentLottery.Participants {
		if p.UserID != userID {
			continue
		}

		// スライスから削除
		currentLottery.Participants = append(
			currentLottery.Participants[:i],
			currentLottery.Participants[i+1:]...,
		)
		found = true
		logger.Info("Participant deleted",
			zap.String("user_id", userID),
			zap.Int("remaining_participants", len(currentLottery.Participants)))
		break
	}

	if !found {
		http.Error(w, "Participant not found", http.StatusNotFound)
		return
	}

	// DBからも削除
	if err := localdb.DeleteLotteryParticipant(userID); err != nil {
		logger.Error("Failed to delete participant from database", zap.Error(err))
		// エラーがあってもメモリ上の操作は継続
	}

	// WebSocketで参加者リスト更新を通知
	BroadcastWSMessage("lottery_participants_updated", buildParticipantsUpdatePayload(currentLottery.Participants))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Participant deleted",
	})
}

// handleUpdateParticipant は特定の参加者の情報を更新
func handleUpdateParticipant(w http.ResponseWriter, r *http.Request, userID string) {
	// リクエストボディをパース
	var updates types.PresentParticipant
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 参加者を探して更新
	found := false
	var updatedParticipant types.PresentParticipant
	for i, p := range currentLottery.Participants {
		if p.UserID != userID {
			continue
		}

		// サブスク状態の変更をチェック
		subscriberChanged := p.IsSubscriber != updates.IsSubscriber

		// 更新可能なフィールドのみ更新
		if updates.EntryCount > 0 {
			currentLottery.Participants[i].EntryCount = updates.EntryCount
		}
		if updates.DisplayName != "" {
			currentLottery.Participants[i].DisplayName = updates.DisplayName
		}
		if updates.Username != "" {
			currentLottery.Participants[i].Username = updates.Username
		}

		// サブスク情報も更新可能
		currentLottery.Participants[i].IsSubscriber = updates.IsSubscriber
		currentLottery.Participants[i].SubscriberTier = updates.SubscriberTier
		currentLottery.Participants[i].SubscribedMonths = updates.SubscribedMonths

		// サブスク状態が変更された場合は色を再割り当て
		if subscriberChanged {
			currentLottery.Participants[i].AssignedColor = assignColorToParticipant(currentLottery.Participants[i])
		}

		updatedParticipant = currentLottery.Participants[i]
		found = true
		logger.Info("Participant updated",
			zap.String("user_id", userID),
			zap.Int("entry_count", updates.EntryCount),
			zap.Bool("is_subscriber", updates.IsSubscriber))
		break
	}

	if !found {
		http.Error(w, "Participant not found", http.StatusNotFound)
		return
	}

	// DBも更新
	if err := localdb.UpdateLotteryParticipant(userID, updatedParticipant); err != nil {
		logger.Error("Failed to update participant in database", zap.Error(err))
		// エラーがあってもメモリ上の操作は継続
	}

	// WebSocketで参加者リスト更新を通知
	BroadcastWSMessage("lottery_participants_updated", buildParticipantsUpdatePayload(currentLottery.Participants))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Participant updated",
	})
}
