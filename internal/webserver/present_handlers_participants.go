package webserver

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
	"go.uber.org/zap"
)

// handlePresentTest はテスト用の抽選実行エンドポイント
func handlePresentTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 現在の参加者数を取得して次のIDを生成
	nextID := len(currentLottery.Participants) + 1
	userIDStr := "test-user-" + strconv.Itoa(nextID)
	username := "test_user_" + strconv.Itoa(nextID)
	displayName := "テストユーザー" + strconv.Itoa(nextID)

	// ランダムなサブスク情報を生成
	isSubscriber := rand.Float32() < 0.5 // 50%の確率でサブスク
	var subscriberTier string
	subscribedMonths := 0

	if isSubscriber {
		// Tierは1000, 2000, 3000からランダム
		tiers := []string{"1000", "2000", "3000"}
		subscriberTier = tiers[rand.Intn(len(tiers))]
		subscribedMonths = rand.Intn(24) + 1
	}

	// 購入口数を1-3でランダムに生成
	entryCount := rand.Intn(3) + 1

	// テスト用の参加者を1人作成
	now := time.Now()
	testParticipant := types.PresentParticipant{
		UserID:           userIDStr,
		Username:         username,
		DisplayName:      displayName,
		AvatarURL:        "",
		RedeemedAt:       now,
		IsSubscriber:     isSubscriber,
		SubscribedMonths: subscribedMonths,
		SubscriberTier:   subscriberTier,
		EntryCount:       entryCount,
		AssignedColor:    "", // 色は後で割り当て
	}

	// 色を割り当て
	testParticipant.AssignedColor = assignColorToParticipant(testParticipant)

	// 既存の参加者リストに追加（累積）
	currentLottery.Participants = append(currentLottery.Participants, testParticipant)

	// DBに保存
	if err := localdb.AddLotteryParticipant(testParticipant); err != nil {
		logger.Error("Failed to save participant to database", zap.Error(err))
		// エラーがあってもメモリ上の操作は継続
	}

	logger.Info("Test lottery participant added",
		zap.String("user_id", userIDStr),
		zap.Bool("is_subscriber", isSubscriber),
		zap.Int("total_participants", len(currentLottery.Participants)))

	// WebSocketで参加者追加を通知
	BroadcastWSMessage("lottery_participant_added", testParticipant)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"message":     "Test participant added",
		"participant": testParticipant,
		"total":       len(currentLottery.Participants),
	})
}

// handlePresentParticipants は現在の参加者リストを取得
func handlePresentParticipants(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 設定からLOTTERY_ENABLEDをチェック
	db := localdb.GetDB()
	if db == nil {
		http.Error(w, "Database not initialized", http.StatusInternalServerError)
		return
	}

	// LOTTERY_ENABLEDは廃止、常に有効として扱う
	isEnabled := true
	baseTicketsLimit, finalTicketsLimit := getLotteryTicketLimits()

	// DBから最新の参加者リストを読み込んでメモリも更新
	participants, err := localdb.GetAllLotteryParticipants()
	if err != nil {
		logger.Error("Failed to load participants from database", zap.Error(err))
		// エラー時はメモリ上のデータを返す
	} else {
		// メモリ上の参加者リストを更新
		currentLottery.Participants = participants
		logger.Info("Participants loaded from database",
			zap.Int("count", len(participants)))
	}

	logger.Info("Returning participants to frontend",
		zap.Int("count", len(currentLottery.Participants)),
		zap.Bool("enabled", isEnabled),
		zap.Int("base_tickets_limit", baseTicketsLimit),
		zap.Int("final_tickets_limit", finalTicketsLimit),
		zap.Bool("is_locked", currentLottery.IsLocked))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"enabled":             isEnabled,
		"is_running":          currentLottery.IsRunning,
		"is_locked":           currentLottery.IsLocked,
		"base_tickets_limit":  baseTicketsLimit,
		"final_tickets_limit": finalTicketsLimit,
		"participants":        currentLottery.Participants,
		"winner":              currentLottery.Winner,
	})
}

// handlePresentStart は抽選を開始
func handlePresentStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if len(currentLottery.Participants) == 0 {
		http.Error(w, "No participants", http.StatusBadRequest)
		return
	}

	if currentLottery.IsRunning {
		http.Error(w, "Lottery already running", http.StatusBadRequest)
		return
	}

	now := time.Now()
	currentLottery.IsRunning = true
	currentLottery.StartedAt = &now
	currentLottery.Winner = nil

	logger.Info("Lottery started",
		zap.Int("participants", len(currentLottery.Participants)))

	// WebSocketで抽選開始を通知
	BroadcastWSMessage("lottery_started", map[string]interface{}{
		"participants": currentLottery.Participants,
		"started_at":   now,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Lottery started",
	})
}

// AddLotteryParticipant は抽選参加者を追加（EventSubハンドラから呼ばれる）
func AddLotteryParticipant(participant types.PresentParticipant) {
	// 重複チェック（同じUserIDが既に存在する場合は追加しない）
	for _, p := range currentLottery.Participants {
		if p.UserID == participant.UserID {
			logger.Debug("Participant already exists, skipping",
				zap.String("user_id", participant.UserID))
			return
		}
	}

	// 色を割り当て（まだ割り当てられていない場合）
	if participant.AssignedColor == "" {
		participant.AssignedColor = assignColorToParticipant(participant)
	}

	// メモリ上のリストに追加
	currentLottery.Participants = append(currentLottery.Participants, participant)

	// DBに保存
	if err := localdb.AddLotteryParticipant(participant); err != nil {
		logger.Error("Failed to save participant to database", zap.Error(err))
		// エラーがあってもメモリ上の操作は継続
	}

	logger.Info("Lottery participant added",
		zap.String("user_id", participant.UserID),
		zap.String("username", participant.Username),
		zap.Int("total_participants", len(currentLottery.Participants)))

	// WebSocketで参加者追加を通知
	BroadcastWSMessage("lottery_participant_added", participant)
}

// handlePresentClear は参加者リストをクリア
func handlePresentClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ClearLotteryParticipants()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Participants cleared",
	})
}

// ClearLotteryParticipants は参加者リストをクリア
func ClearLotteryParticipants() {
	// メモリ上のリストをクリア
	currentLottery.Participants = []types.PresentParticipant{}
	currentLottery.Winner = nil
	currentLottery.IsRunning = false
	currentLottery.StartedAt = nil

	// DBからも削除
	if err := localdb.ClearAllLotteryParticipants(); err != nil {
		logger.Error("Failed to clear participants from database", zap.Error(err))
		// エラーがあってもメモリ上の操作は継続
	}

	logger.Info("Lottery participants cleared")

	// WebSocketで参加者クリアを通知
	BroadcastWSMessage("lottery_participants_cleared", nil)
}
