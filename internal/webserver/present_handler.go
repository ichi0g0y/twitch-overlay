package webserver

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// PresentParticipant は抽選参加者の情報
type PresentParticipant struct {
	UserID           string    `json:"user_id"`
	Username         string    `json:"username"`
	DisplayName      string    `json:"display_name"`
	AvatarURL        string    `json:"avatar_url"`
	RedeemedAt       time.Time `json:"redeemed_at"`
	IsSubscriber     bool      `json:"is_subscriber"`
	SubscribedMonths int       `json:"subscribed_months"`
	SubscriberTier   string    `json:"subscriber_tier"` // "1000", "2000", "3000"
	EntryCount       int       `json:"entry_count"`     // 購入口数（最大3口）
}

// PresentLottery は抽選の状態
type PresentLottery struct {
	IsRunning    bool                 `json:"is_running"`
	Participants []PresentParticipant `json:"participants"`
	Winner       *PresentParticipant  `json:"winner,omitempty"`
	StartedAt    *time.Time           `json:"started_at,omitempty"`
}

var (
	// 現在の抽選状態（メモリ上で管理）
	currentLottery = &PresentLottery{
		IsRunning:    false,
		Participants: []PresentParticipant{},
	}
)

// RegisterPresentRoutes はプレゼントルーレット関連のルートを登録
func RegisterPresentRoutes(mux *http.ServeMux) {
	// API endpoints
	mux.HandleFunc("/api/present/test", corsMiddleware(handlePresentTest))
	mux.HandleFunc("/api/present/participants", corsMiddleware(handlePresentParticipants))
	mux.HandleFunc("/api/present/participants/", corsMiddleware(handlePresentParticipant))
	mux.HandleFunc("/api/present/start", corsMiddleware(handlePresentStart))
	mux.HandleFunc("/api/present/stop", corsMiddleware(handlePresentStop))
	mux.HandleFunc("/api/present/clear", corsMiddleware(handlePresentClear))

	// /presentパスはSPAのフォールバック処理に任せる
}

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
	var subscribedMonths int
	var subscriberTier string

	if isSubscriber {
		// サブスクの場合は1-60ヶ月でランダム
		subscribedMonths = rand.Intn(60) + 1

		// Tierは1000, 2000, 3000からランダム
		tiers := []string{"1000", "2000", "3000"}
		subscriberTier = tiers[rand.Intn(len(tiers))]
	}

	// 購入口数を1-3でランダムに生成
	entryCount := rand.Intn(3) + 1

	// テスト用の参加者を1人作成
	now := time.Now()
	testParticipant := PresentParticipant{
		UserID:           userIDStr,
		Username:         username,
		DisplayName:      displayName,
		AvatarURL:        "",
		RedeemedAt:       now,
		IsSubscriber:     isSubscriber,
		SubscribedMonths: subscribedMonths,
		SubscriberTier:   subscriberTier,
		EntryCount:       entryCount,
	}

	// 既存の参加者リストに追加（累積）
	currentLottery.Participants = append(currentLottery.Participants, testParticipant)

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

	settingsManager := settings.NewSettingsManager(db)
	enabled, err := settingsManager.GetRealValue("LOTTERY_ENABLED")
	if err != nil || enabled != "true" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"enabled":      false,
			"participants": []PresentParticipant{},
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"enabled":      true,
		"is_running":   currentLottery.IsRunning,
		"participants": currentLottery.Participants,
		"winner":       currentLottery.Winner,
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

// handlePresentStop は抽選を停止
func handlePresentStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !currentLottery.IsRunning {
		http.Error(w, "Lottery not running", http.StatusBadRequest)
		return
	}

	currentLottery.IsRunning = false
	currentLottery.StartedAt = nil

	logger.Info("Lottery stopped")

	// WebSocketで抽選停止を通知
	BroadcastWSMessage("lottery_stopped", map[string]interface{}{
		"stopped_at": time.Now(),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Lottery stopped",
	})
}

// AddLotteryParticipant は抽選参加者を追加（EventSubハンドラから呼ばれる）
func AddLotteryParticipant(participant PresentParticipant) {
	// 重複チェック（同じUserIDが既に存在する場合は追加しない）
	for _, p := range currentLottery.Participants {
		if p.UserID == participant.UserID {
			logger.Debug("Participant already exists, skipping",
				zap.String("user_id", participant.UserID))
			return
		}
	}

	currentLottery.Participants = append(currentLottery.Participants, participant)

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
	currentLottery.Participants = []PresentParticipant{}
	currentLottery.Winner = nil
	currentLottery.IsRunning = false
	currentLottery.StartedAt = nil

	logger.Info("Lottery participants cleared")

	// WebSocketで参加者クリアを通知
	BroadcastWSMessage("lottery_participants_cleared", nil)
}

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
		handleDeleteParticipant(w, r, userID)
	case http.MethodPut:
		handleUpdateParticipant(w, r, userID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleDeleteParticipant は特定の参加者を削除
func handleDeleteParticipant(w http.ResponseWriter, r *http.Request, userID string) {
	// 参加者を探して削除
	found := false
	for i, p := range currentLottery.Participants {
		if p.UserID == userID {
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
	}

	if !found {
		http.Error(w, "Participant not found", http.StatusNotFound)
		return
	}

	// WebSocketで参加者リスト更新を通知
	BroadcastWSMessage("lottery_participants_updated", currentLottery.Participants)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Participant deleted",
	})
}

// handleUpdateParticipant は特定の参加者の情報を更新
func handleUpdateParticipant(w http.ResponseWriter, r *http.Request, userID string) {
	// リクエストボディをパース
	var updates PresentParticipant
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 参加者を探して更新
	found := false
	for i, p := range currentLottery.Participants {
		if p.UserID == userID {
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
			currentLottery.Participants[i].SubscribedMonths = updates.SubscribedMonths
			currentLottery.Participants[i].SubscriberTier = updates.SubscriberTier

			found = true
			logger.Info("Participant updated",
				zap.String("user_id", userID),
				zap.Int("entry_count", updates.EntryCount),
				zap.Bool("is_subscriber", updates.IsSubscriber))
			break
		}
	}

	if !found {
		http.Error(w, "Participant not found", http.StatusNotFound)
		return
	}

	// WebSocketで参加者リスト更新を通知
	BroadcastWSMessage("lottery_participants_updated", currentLottery.Participants)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Participant updated",
	})
}
