package webserver

import (
	"github.com/ichi0g0y/twitch-overlay/internal/lottery"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// logDrawResult は抽選結果の構造化ログをInfoレベルで出力する。
func logDrawResult(result *presentStopResult) {
	if result == nil || result.winner == nil || result.drawResult == nil {
		return
	}

	logger.Info("Lottery stopped with winner",
		zap.String("winner_username", result.winner.Username),
		zap.String("winner_user_id", result.winner.UserID),
		zap.Int("total_participants", result.drawResult.TotalParticipants),
		zap.Int("total_tickets", result.drawResult.TotalTickets))
}

// logDrawParticipantsDetail は参加者口数詳細をDebugレベルで出力する。
func logDrawParticipantsDetail(details []lottery.ParticipantDetail) {
	for _, detail := range details {
		logger.Debug("Lottery participant detail",
			zap.String("username", detail.Username),
			zap.Int("base_tickets", detail.BaseTickets),
			zap.Int("final_tickets", detail.FinalTickets),
			zap.Bool("is_excluded", detail.IsExcluded))
	}
}
