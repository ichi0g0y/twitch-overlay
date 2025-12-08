package webserver

import (
	"encoding/json"
	"math"
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
	mux.HandleFunc("/api/present/start", corsMiddleware(handlePresentStart))
	mux.HandleFunc("/api/present/stop", corsMiddleware(handlePresentStop))
	mux.HandleFunc("/api/present/draw", corsMiddleware(handlePresentDraw))
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

// calculateBonusWeight はサブスクボーナス口数を計算
func calculateBonusWeight(participant PresentParticipant) int {
	if !participant.IsSubscriber || participant.SubscribedMonths <= 0 {
		return 0
	}

	// Tier係数を取得
	tierMultiplier := 1.0
	switch participant.SubscriberTier {
	case "3000": // Tier 3
		tierMultiplier = 1.2
	case "2000": // Tier 2
		tierMultiplier = 1.1
	default: // Tier 1 (1000)
		tierMultiplier = 1.0
	}

	// ボーナス計算（切り上げ）
	// ボーナス口数 = 累計サブスク月数 × Tier係数 × 1.1 ÷ 3（切り上げ）
	bonusCalculation := float64(participant.SubscribedMonths) * tierMultiplier * 1.1 / 3.0
	bonusWeight := int(math.Ceil(bonusCalculation))

	// 最低ボーナス：サブスク登録者は最低1口
	if bonusWeight < 1 {
		bonusWeight = 1
	}

	return bonusWeight
}

// handlePresentDraw は抽選を実行して当選者を決定
func handlePresentDraw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if len(currentLottery.Participants) == 0 {
		http.Error(w, "No participants", http.StatusBadRequest)
		return
	}

	// 各参加者の総口数を計算
	type weightedParticipant struct {
		participant PresentParticipant
		weight      int
		rangeStart  int
		rangeEnd    int
	}

	weightedParticipants := make([]weightedParticipant, 0, len(currentLottery.Participants))
	totalWeight := 0

	for _, p := range currentLottery.Participants {
		baseCount := p.EntryCount
		if baseCount == 0 {
			baseCount = 1
		}
		bonusWeight := calculateBonusWeight(p)
		weight := baseCount + bonusWeight

		rangeStart := totalWeight
		rangeEnd := totalWeight + weight

		weightedParticipants = append(weightedParticipants, weightedParticipant{
			participant: p,
			weight:      weight,
			rangeStart:  rangeStart,
			rangeEnd:    rangeEnd,
		})

		totalWeight += weight
	}

	// 総口数の範囲でランダムな数値を生成
	randomValue := rand.Intn(totalWeight)

	// ランダムな数値が該当する参加者を探す
	var winner PresentParticipant
	var winnerIndex int
	for i, wp := range weightedParticipants {
		if randomValue >= wp.rangeStart && randomValue < wp.rangeEnd {
			winner = wp.participant
			winnerIndex = i
			break
		}
	}

	currentLottery.Winner = &winner
	currentLottery.IsRunning = false

	logger.Info("Lottery winner drawn",
		zap.String("winner_user_id", winner.UserID),
		zap.String("winner_username", winner.Username),
		zap.Int("winner_index", winnerIndex),
		zap.Int("total_weight", totalWeight),
		zap.Int("random_value", randomValue))

	// WebSocketで当選者を通知（インデックス付き）
	BroadcastWSMessage("lottery_winner", map[string]interface{}{
		"winner":       winner,
		"winner_index": winnerIndex,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"winner":  winner,
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
