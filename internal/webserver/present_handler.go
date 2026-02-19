package webserver

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchtoken"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
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

// InitializePresentLottery は起動時にロック状態を設定DBから復元し、Twitchリワードの状態を同期
func InitializePresentLottery() error {
	db := localdb.GetDB()
	if db == nil {
		return nil // DBが初期化されていない場合はスキップ
	}

	settingsManager := settings.NewSettingsManager(db)

	// ロック状態を設定DBから復元
	lockedStr, _ := settingsManager.GetRealValue("LOTTERY_LOCKED")
	isLocked := (lockedStr == "true")
	currentLottery.IsLocked = isLocked

	logger.Info("Present lottery lock state restored from settings",
		zap.Bool("is_locked", isLocked))

	// Twitchリワードの状態を同期
	rewardID, err := settingsManager.GetRealValue("LOTTERY_REWARD_ID")
	if err != nil || rewardID == "" {
		logger.Info("LOTTERY_REWARD_ID not configured, skipping reward state sync")
		return nil
	}

	broadcasterID, err := settingsManager.GetRealValue("TWITCH_USER_ID")
	if err != nil || broadcasterID == "" {
		logger.Info("TWITCH_USER_ID not configured, skipping reward state sync")
		return nil
	}

	// アクセストークンを取得
	token, valid, err := twitchtoken.GetLatestToken()
	if err != nil || !valid {
		logger.Warn("Failed to get valid token for reward state sync on startup",
			zap.Error(err))
		return nil // トークンがない場合はスキップ（後で手動でロック/解除可能）
	}

	// ロック状態に応じてリワードを有効/無効化
	enabled := !isLocked
	if err := twitchapi.UpdateCustomRewardEnabled(broadcasterID, rewardID, enabled, token.AccessToken); err != nil {
		logger.Error("Failed to sync reward state on startup",
			zap.String("reward_id", rewardID),
			zap.Bool("enabled", enabled),
			zap.Error(err))
		return nil // エラーでも起動は継続
	}

	logger.Info("Reward state synced on startup",
		zap.String("reward_id", rewardID),
		zap.Bool("enabled", enabled))

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
	mux.HandleFunc("/api/present/lock", corsMiddleware(handlePresentLock))
	mux.HandleFunc("/api/present/unlock", corsMiddleware(handlePresentUnlock))
	mux.HandleFunc("/api/present/refresh-subscribers", corsMiddleware(handleRefreshSubscribers))

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
		zap.Bool("is_locked", currentLottery.IsLocked))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"enabled":      isEnabled,
		"is_running":   currentLottery.IsRunning,
		"is_locked":    currentLottery.IsLocked,
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

// handleRefreshSubscribers は全参加者のサブスク状況をTwitch APIから更新
func handleRefreshSubscribers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	db := localdb.GetDB()
	if db == nil {
		http.Error(w, "Database not initialized", http.StatusInternalServerError)
		return
	}

	settingsManager := settings.NewSettingsManager(db)

	// ブロードキャスターIDを取得
	broadcasterID, err := settingsManager.GetRealValue("TWITCH_USER_ID")
	if err != nil || broadcasterID == "" {
		http.Error(w, "TWITCH_USER_ID not configured", http.StatusBadRequest)
		return
	}

	// 1. 全参加者を取得
	participants, err := localdb.GetAllLotteryParticipants()
	if err != nil {
		logger.Error("Failed to get lottery participants", zap.Error(err))
		http.Error(w, "Failed to get participants", http.StatusInternalServerError)
		return
	}

	if len(participants) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "No participants to refresh",
			"updated": 0,
		})
		return
	}

	// 2. 各参加者のサブスク状況を Twitch API から取得して更新
	updatedCount := 0
	colorReassignNeeded := false

	for i := range participants {
		p := &participants[i]

		// user_idが数値かチェック（Twitch APIは数値のみ受け付ける）
		isNumeric := len(p.UserID) > 0
		for _, c := range p.UserID {
			if c < '0' || c > '9' {
				isNumeric = false
				break
			}
		}

		// 非数値のuser_idはスキップ（テストデータなど）
		if !isNumeric {
			logger.Debug("Skipping non-numeric user_id",
				zap.String("user_id", p.UserID))
			continue
		}

		// Twitch API でサブスク状況を取得
		subInfo, err := twitchapi.GetUserSubscriptionCached(broadcasterID, p.UserID)

		// サブスク状況が変わったかチェック
		oldIsSubscriber := p.IsSubscriber
		oldTier := p.SubscriberTier
		oldMonths := p.SubscribedMonths

		if err != nil {
			// サブスクではない、またはエラー
			p.IsSubscriber = false
			p.SubscribedMonths = 0
			p.SubscriberTier = ""
			logger.Debug("User is not subscribed or error occurred",
				zap.String("user_id", p.UserID),
				zap.Error(err))
		} else {
			// サブスク情報取得成功
			p.IsSubscriber = true
			p.SubscribedMonths = subInfo.CumulativeMonths
			p.SubscriberTier = subInfo.Tier
			logger.Debug("User subscription info retrieved",
				zap.String("user_id", p.UserID),
				zap.Int("cumulative_months", subInfo.CumulativeMonths),
				zap.String("tier", subInfo.Tier))
		}

		// 変更があった場合のみ更新
		if oldIsSubscriber != p.IsSubscriber || oldTier != p.SubscriberTier || oldMonths != p.SubscribedMonths {
			if err := localdb.UpdateLotteryParticipant(p.UserID, *p); err != nil {
				logger.Error("Failed to update participant",
					zap.String("user_id", p.UserID),
					zap.Error(err))
				continue
			}
			updatedCount++

			// サブスク状況が変わった場合、色の再割り当てが必要
			if oldIsSubscriber != p.IsSubscriber {
				colorReassignNeeded = true
			}

			logger.Info("Participant subscription status updated",
				zap.String("user_id", p.UserID),
				zap.Bool("old_is_subscriber", oldIsSubscriber),
				zap.Bool("new_is_subscriber", p.IsSubscriber),
				zap.Int("old_subscribed_months", oldMonths),
				zap.Int("new_subscribed_months", p.SubscribedMonths))
		}
	}

	// 3. 色の再割り当てが必要な場合は実行
	if colorReassignNeeded {
		logger.Info("Reassigning colors due to subscription changes")

		// 最新の参加者リストを取得
		participants, err = localdb.GetAllLotteryParticipants()
		if err != nil {
			logger.Error("Failed to reload participants for color reassignment", zap.Error(err))
		} else {
			// メモリ上のリストを更新
			currentLottery.Participants = participants

			// 全参加者の色を再割り当て
			for i := range currentLottery.Participants {
				newColor := assignColorToParticipant(currentLottery.Participants[i])
				currentLottery.Participants[i].AssignedColor = newColor
				if err := localdb.UpdateLotteryParticipant(
					currentLottery.Participants[i].UserID,
					currentLottery.Participants[i]); err != nil {
					logger.Warn("Failed to update participant color in database",
						zap.String("user_id", currentLottery.Participants[i].UserID),
						zap.Error(err))
				}
			}
		}
	} else {
		// 色の再割り当てが不要でも、メモリ上のリストは最新化
		currentLottery.Participants = participants
	}

	// 4. WebSocket で更新を通知
	BroadcastWSMessage("lottery_participants_updated", currentLottery.Participants)

	// 5. レスポンス返却
	logger.Info("Subscriber status refresh completed",
		zap.Int("total", len(participants)),
		zap.Int("updated", updatedCount),
		zap.Bool("color_reassigned", colorReassignNeeded))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Subscriber status refreshed",
		"updated": updatedCount,
	})
}

// handlePresentLock はルーレットをロック（Twitchリワードを無効化）
func handlePresentLock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	db := localdb.GetDB()
	if db == nil {
		http.Error(w, "Database not initialized", http.StatusInternalServerError)
		return
	}

	settingsManager := settings.NewSettingsManager(db)

	// リワードIDとブロードキャスターIDを取得
	rewardID, err := settingsManager.GetRealValue("LOTTERY_REWARD_ID")
	if err != nil || rewardID == "" {
		http.Error(w, "LOTTERY_REWARD_ID not configured", http.StatusBadRequest)
		return
	}

	broadcasterID, err := settingsManager.GetRealValue("TWITCH_USER_ID")
	if err != nil || broadcasterID == "" {
		http.Error(w, "TWITCH_USER_ID not configured", http.StatusBadRequest)
		return
	}

	// アクセストークンを取得
	token, valid, err := twitchtoken.GetLatestToken()
	if err != nil || !valid {
		logger.Error("Failed to get valid token for lock", zap.Error(err))
		http.Error(w, "Failed to get valid token", http.StatusInternalServerError)
		return
	}

	// Twitch APIでリワードを無効化
	if err := twitchapi.UpdateCustomRewardEnabled(broadcasterID, rewardID, false, token.AccessToken); err != nil {
		logger.Error("Failed to disable reward via Twitch API",
			zap.String("reward_id", rewardID),
			zap.Error(err))
		http.Error(w, "Failed to disable reward", http.StatusInternalServerError)
		return
	}

	// 設定DBに保存
	if err := settingsManager.SetSetting("LOTTERY_LOCKED", "true"); err != nil {
		logger.Error("Failed to save LOTTERY_LOCKED setting", zap.Error(err))
		// Twitch側は無効化済みなので、エラーでも続行
	}

	// メモリ上の状態を更新
	currentLottery.IsLocked = true

	logger.Info("Lottery locked (reward disabled via Twitch API)",
		zap.String("reward_id", rewardID))

	// WebSocketで通知
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

	db := localdb.GetDB()
	if db == nil {
		http.Error(w, "Database not initialized", http.StatusInternalServerError)
		return
	}

	settingsManager := settings.NewSettingsManager(db)

	// リワードIDとブロードキャスターIDを取得
	rewardID, err := settingsManager.GetRealValue("LOTTERY_REWARD_ID")
	if err != nil || rewardID == "" {
		http.Error(w, "LOTTERY_REWARD_ID not configured", http.StatusBadRequest)
		return
	}

	broadcasterID, err := settingsManager.GetRealValue("TWITCH_USER_ID")
	if err != nil || broadcasterID == "" {
		http.Error(w, "TWITCH_USER_ID not configured", http.StatusBadRequest)
		return
	}

	// アクセストークンを取得
	token, valid, err := twitchtoken.GetLatestToken()
	if err != nil || !valid {
		logger.Error("Failed to get valid token for unlock", zap.Error(err))
		http.Error(w, "Failed to get valid token", http.StatusInternalServerError)
		return
	}

	// Twitch APIでリワードを有効化
	if err := twitchapi.UpdateCustomRewardEnabled(broadcasterID, rewardID, true, token.AccessToken); err != nil {
		logger.Error("Failed to enable reward via Twitch API",
			zap.String("reward_id", rewardID),
			zap.Error(err))
		http.Error(w, "Failed to enable reward", http.StatusInternalServerError)
		return
	}

	// 設定DBに保存
	if err := settingsManager.SetSetting("LOTTERY_LOCKED", "false"); err != nil {
		logger.Error("Failed to save LOTTERY_LOCKED setting", zap.Error(err))
		// Twitch側は有効化済みなので、エラーでも続行
	}

	// メモリ上の状態を更新
	currentLottery.IsLocked = false

	logger.Info("Lottery unlocked (reward enabled via Twitch API)",
		zap.String("reward_id", rewardID))

	// WebSocketで通知
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
