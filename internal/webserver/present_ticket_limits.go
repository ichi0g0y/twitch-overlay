package webserver

import (
	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
	"go.uber.org/zap"
)

func getLotteryTicketLimits() (int, int) {
	settings, err := localdb.GetLotterySettings()
	if err != nil {
		logger.Warn("Failed to get lottery settings, fallback to defaults", zap.Error(err))
		return 3, 0
	}

	return settings.BaseTicketsLimit, settings.FinalTicketsLimit
}

func buildParticipantsUpdatePayload(participants []types.PresentParticipant) map[string]interface{} {
	baseTicketsLimit, finalTicketsLimit := getLotteryTicketLimits()
	return map[string]interface{}{
		"participants":        participants,
		"base_tickets_limit":  baseTicketsLimit,
		"final_tickets_limit": finalTicketsLimit,
	}
}
