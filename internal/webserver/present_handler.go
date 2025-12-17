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
	"github.com/nantokaworks/twitch-overlay/internal/twitchapi"
	"github.com/nantokaworks/twitch-overlay/internal/types"
	"go.uber.org/zap"
)

var (
	// 現在の抽選状態（メモリ上で管理）
	currentLottery = &types.PresentLottery{
		IsRunning:    false,
		Participants: []types.PresentParticipant{},
	}

	// ルーレット用の色パレット（サブスク以外の参加者用）
	colorPalette = []string{
		"#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6",
		"#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#a855f7",
	}
)

// assignColorToParticipant は参加者に色を割り当てる
// Twitch APIでユーザーのチャット色を取得し、取得できない場合はパレットから割り当てる
func assignColorToParticipant(participant types.PresentParticipant) string {
	// user_idが数値かチェック（Twitch APIは数値のみ受け付ける）
	isNumeric := len(participant.UserID) > 0
	for _, c := range participant.UserID {
		if c < '0' || c > '9' {
			isNumeric = false
			break
		}
	}

	// 数値のuser_idの場合のみTwitch APIで色を取得
	if isNumeric {
		colors, err := twitchapi.GetUserChatColors([]string{participant.UserID})
		if err != nil {
			logger.Warn("Failed to get user chat color from Twitch API, using palette",
				zap.String("user_id", participant.UserID),
				zap.Error(err))
		} else if len(colors) > 0 && colors[0].Color != "" {
			// 色が取得できた場合はその色を使用
			logger.Debug("Using Twitch chat color for participant",
				zap.String("user_id", participant.UserID),
				zap.String("color", colors[0].Color))
			return colors[0].Color
		}
	} else {
		logger.Debug("Non-numeric user_id, skipping Twitch API",
			zap.String("user_id", participant.UserID))
	}

	// Twitch APIで色が取得できなかった、または未設定/非数値の場合はパレットから割り当て
	logger.Debug("Twitch color not available, using palette",
		zap.String("user_id", participant.UserID))

	// 既存の参加者が使用している色を収集
	usedColors := make(map[string]bool)
	for _, p := range currentLottery.Participants {
		if p.AssignedColor != "" {
			usedColors[p.AssignedColor] = true
		}
	}

	// 未使用の色を探す
	for _, color := range colorPalette {
		if !usedColors[color] {
			return color
		}
	}

	// 全ての色が使用済みの場合は、user_idのハッシュで決定
	hash := 0
	for _, c := range participant.UserID {
		hash = hash*31 + int(c)
	}
	return colorPalette[hash%len(colorPalette)]
}

// LoadLotteryParticipantsFromDB はDBから参加者を復元する（起動時に呼ばれる）
func LoadLotteryParticipantsFromDB() error {
	participants, err := localdb.GetAllLotteryParticipants()
	if err != nil {
		logger.Error("Failed to load participants from database", zap.Error(err))
		return err
	}

	currentLottery.Participants = participants

	logger.Info("Lottery participants loaded from database",
		zap.Int("count", len(participants)))

	// 参加者がいない場合は処理不要
	if len(participants) == 0 {
		return nil
	}

	// 全参加者のuser_idを収集（数値のみ）
	// Twitch APIは数値のuser_idのみを受け付けるため、テストデータなどの文字列IDは除外
	userIDs := make([]string, 0, len(participants))
	for _, p := range participants {
		// user_idが数値かチェック（すべての文字が数字であることを確認）
		isNumeric := len(p.UserID) > 0
		for _, c := range p.UserID {
			if c < '0' || c > '9' {
				isNumeric = false
				break
			}
		}
		if isNumeric {
			userIDs = append(userIDs, p.UserID)
		} else {
			logger.Debug("Skipping non-numeric user_id for Twitch API call",
				zap.String("user_id", p.UserID),
				zap.String("username", p.Username))
		}
	}

	// 取得した色をマップに変換（user_id -> color）
	colorMap := make(map[string]string)

	// 数値のuser_idがある場合のみTwitch APIを呼び出し
	if len(userIDs) > 0 {
		// Twitch APIでバッチ取得（最大100件）
		colors, err := twitchapi.GetUserChatColors(userIDs)
		if err != nil {
			logger.Warn("Failed to batch get user chat colors, participants will use existing colors",
				zap.Error(err))
			// エラーがあっても処理は継続（パレット色割り当てに進む）
		} else {
			// 取得した色をマップに格納
			for _, c := range colors {
				if c.Color != "" {
					colorMap[c.UserID] = c.Color
				}
			}
			logger.Info("Batch retrieved user chat colors",
				zap.Int("total_participants", len(participants)),
				zap.Int("numeric_user_ids", len(userIDs)),
				zap.Int("colors_retrieved", len(colorMap)))
		}
	} else {
		logger.Info("No numeric user_ids found, skipping Twitch API call",
			zap.Int("total_participants", len(participants)))
	}

	// この時点でcolorMapには取得できた色が入っている（空の場合もある）
	// 以下は全参加者に対する色割り当て処理

	// 参加者の色を更新
	needsColorAssignment := []int{} // パレットから色を割り当てる必要がある参加者のインデックス
	for i := range currentLottery.Participants {
		if color, ok := colorMap[currentLottery.Participants[i].UserID]; ok {
			// Twitch色が取得できた場合
			currentLottery.Participants[i].AssignedColor = color
			logger.Debug("Updated participant color from Twitch",
				zap.String("user_id", currentLottery.Participants[i].UserID),
				zap.String("color", color))
		} else if currentLottery.Participants[i].AssignedColor == "" {
			// Twitch色が取得できず、DBにも保存されていない場合
			needsColorAssignment = append(needsColorAssignment, i)
		}
		// DBに保存されている色がある場合はそのまま使用
	}

	// パレットから色を割り当てる必要がある参加者に色を割り当て
	if len(needsColorAssignment) > 0 {
		usedColors := make(map[string]bool)
		for _, p := range currentLottery.Participants {
			if p.AssignedColor != "" {
				usedColors[p.AssignedColor] = true
			}
		}

		for _, idx := range needsColorAssignment {
			// 未使用の色を探す
			assigned := false
			for _, color := range colorPalette {
				if !usedColors[color] {
					currentLottery.Participants[idx].AssignedColor = color
					usedColors[color] = true
					assigned = true
					logger.Debug("Assigned palette color to participant",
						zap.String("user_id", currentLottery.Participants[idx].UserID),
						zap.String("color", color))
					break
				}
			}

			// 全ての色が使用済みの場合はハッシュで決定
			if !assigned {
				hash := 0
				for _, c := range currentLottery.Participants[idx].UserID {
					hash = hash*31 + int(c)
				}
				color := colorPalette[hash%len(colorPalette)]
				currentLottery.Participants[idx].AssignedColor = color
				logger.Debug("Assigned hash-based color to participant",
					zap.String("user_id", currentLottery.Participants[idx].UserID),
					zap.String("color", color))
			}

			// DBに保存
			if err := localdb.UpdateLotteryParticipant(
				currentLottery.Participants[idx].UserID,
				currentLottery.Participants[idx]); err != nil {
				logger.Warn("Failed to update participant color in database",
					zap.String("user_id", currentLottery.Participants[idx].UserID),
					zap.Error(err))
			}
		}
	}

	return nil
}

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
	var subscriberTier string

	if isSubscriber {
		// Tierは1000, 2000, 3000からランダム
		tiers := []string{"1000", "2000", "3000"}
		subscriberTier = tiers[rand.Intn(len(tiers))]
	}

	// 購入口数を1-3でランダムに生成
	entryCount := rand.Intn(3) + 1

	// テスト用の参加者を1人作成
	now := time.Now()
	testParticipant := types.PresentParticipant{
		UserID:         userIDStr,
		Username:       username,
		DisplayName:    displayName,
		AvatarURL:      "",
		RedeemedAt:     now,
		IsSubscriber:   isSubscriber,
		SubscriberTier: subscriberTier,
		EntryCount:     entryCount,
		AssignedColor:  "", // 色は後で割り当て
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

	settingsManager := settings.NewSettingsManager(db)
	enabled, err := settingsManager.GetRealValue("LOTTERY_ENABLED")
	isEnabled := (err == nil && enabled == "true")

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
		zap.Bool("enabled", isEnabled))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"enabled":      isEnabled,
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

	// DBからも削除
	if err := localdb.DeleteLotteryParticipant(userID); err != nil {
		logger.Error("Failed to delete participant from database", zap.Error(err))
		// エラーがあってもメモリ上の操作は継続
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
	var updates types.PresentParticipant
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 参加者を探して更新
	found := false
	var updatedParticipant types.PresentParticipant
	for i, p := range currentLottery.Participants {
		if p.UserID == userID {
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
	BroadcastWSMessage("lottery_participants_updated", currentLottery.Participants)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Participant updated",
	})
}
