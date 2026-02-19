package webserver

import (
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

	userIDs := collectNumericParticipantUserIDs(participants)
	colorMap := fetchParticipantColorMap(userIDs, len(participants))
	applyParticipantColors(colorMap)

	return nil
}

func collectNumericParticipantUserIDs(participants []types.PresentParticipant) []string {
	// Twitch APIは数値のuser_idのみを受け付けるため、テストデータなどの文字列IDは除外
	userIDs := make([]string, 0, len(participants))
	for _, p := range participants {
		isNumeric := len(p.UserID) > 0
		for _, c := range p.UserID {
			if c < '0' || c > '9' {
				isNumeric = false
				break
			}
		}
		if isNumeric {
			userIDs = append(userIDs, p.UserID)
			continue
		}

		logger.Debug("Skipping non-numeric user_id for Twitch API call",
			zap.String("user_id", p.UserID),
			zap.String("username", p.Username))
	}
	return userIDs
}

func fetchParticipantColorMap(userIDs []string, totalParticipants int) map[string]string {
	colorMap := make(map[string]string)
	if len(userIDs) == 0 {
		logger.Info("No numeric user_ids found, skipping Twitch API call",
			zap.Int("total_participants", totalParticipants))
		return colorMap
	}

	colors, err := twitchapi.GetUserChatColors(userIDs)
	if err != nil {
		logger.Warn("Failed to batch get user chat colors, participants will use existing colors",
			zap.Error(err))
		return colorMap
	}

	for _, c := range colors {
		if c.Color != "" {
			colorMap[c.UserID] = c.Color
		}
	}

	logger.Info("Batch retrieved user chat colors",
		zap.Int("total_participants", totalParticipants),
		zap.Int("numeric_user_ids", len(userIDs)),
		zap.Int("colors_retrieved", len(colorMap)))

	return colorMap
}

func applyParticipantColors(colorMap map[string]string) {
	needsColorAssignment := []int{}
	for i := range currentLottery.Participants {
		if color, ok := colorMap[currentLottery.Participants[i].UserID]; ok {
			currentLottery.Participants[i].AssignedColor = color
			logger.Debug("Updated participant color from Twitch",
				zap.String("user_id", currentLottery.Participants[i].UserID),
				zap.String("color", color))
			continue
		}
		if currentLottery.Participants[i].AssignedColor == "" {
			needsColorAssignment = append(needsColorAssignment, i)
		}
	}

	if len(needsColorAssignment) == 0 {
		return
	}

	usedColors := make(map[string]bool)
	for _, p := range currentLottery.Participants {
		if p.AssignedColor != "" {
			usedColors[p.AssignedColor] = true
		}
	}

	for _, idx := range needsColorAssignment {
		assignColorToParticipantAtIndex(idx, usedColors)
		if err := localdb.UpdateLotteryParticipant(
			currentLottery.Participants[idx].UserID,
			currentLottery.Participants[idx]); err != nil {
			logger.Warn("Failed to update participant color in database",
				zap.String("user_id", currentLottery.Participants[idx].UserID),
				zap.Error(err))
		}
	}
}

func assignColorToParticipantAtIndex(idx int, usedColors map[string]bool) {
	for _, color := range colorPalette {
		if usedColors[color] {
			continue
		}
		currentLottery.Participants[idx].AssignedColor = color
		usedColors[color] = true
		logger.Debug("Assigned palette color to participant",
			zap.String("user_id", currentLottery.Participants[idx].UserID),
			zap.String("color", color))
		return
	}

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
