package lottery

import (
	crand "crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"sort"
	"strings"

	"github.com/ichi0g0y/twitch-overlay/internal/types"
)

var (
	ErrNoParticipants      = errors.New("no participants")
	ErrNoEligibleUser      = errors.New("no eligible participants")
	errInvalidTicketsTotal = errors.New("invalid total tickets")
)

// WeightedUser は累積重み抽選に使用するエントリ。
type WeightedUser struct {
	Username      string
	FinalTickets  int
	CumulativeSum int
	Participant   types.PresentParticipant
}

// ParticipantDetail は抽選計算結果の詳細。
type ParticipantDetail struct {
	Username         string `json:"username"`
	BaseTickets      int    `json:"base_tickets"`
	FinalTickets     int    `json:"final_tickets"`
	SubscribedMonths int    `json:"subscribed_months"`
	SubscriberTier   string `json:"subscriber_tier"`
	IsExcluded       bool   `json:"is_excluded"`
}

// DrawOptions は抽選実行時のオプション。
type DrawOptions struct {
	BaseTicketsLimit  int
	FinalTicketsLimit int
	LastWinner        string
}

// DrawResult は抽選結果。
type DrawResult struct {
	Winner             *types.PresentParticipant
	TotalParticipants  int
	TotalTickets       int
	ParticipantsDetail []ParticipantDetail
}

var drawRandomInt = secureRandomInt

// DrawLottery performs weighted random draw with last-winner exclusion.
func DrawLottery(participants []types.PresentParticipant, options DrawOptions) (*DrawResult, error) {
	if len(participants) == 0 {
		return nil, ErrNoParticipants
	}

	weightedUsers, details, totalTickets := buildWeightedUsers(participants, options)
	if len(weightedUsers) == 0 || totalTickets <= 0 {
		return nil, ErrNoEligibleUser
	}

	picked, err := drawRandomInt(totalTickets)
	if err != nil {
		return nil, fmt.Errorf("failed to pick random ticket: %w", err)
	}

	target := picked + 1 // 1-based index
	idx := sort.Search(len(weightedUsers), func(i int) bool {
		return weightedUsers[i].CumulativeSum >= target
	})
	if idx >= len(weightedUsers) {
		return nil, errInvalidTicketsTotal
	}

	winner := weightedUsers[idx].Participant
	return &DrawResult{
		Winner:             &winner,
		TotalParticipants:  len(participants),
		TotalTickets:       totalTickets,
		ParticipantsDetail: details,
	}, nil
}

func buildWeightedUsers(participants []types.PresentParticipant, options DrawOptions) ([]WeightedUser, []ParticipantDetail, int) {
	weightedUsers := make([]WeightedUser, 0, len(participants))
	details := make([]ParticipantDetail, 0, len(participants))
	totalTickets := 0

	for _, participant := range participants {
		baseTickets := CalculateBaseTickets(
			[]RewardUsage{{Count: participant.EntryCount}},
			options.BaseTicketsLimit,
		)

		subscriptionInfo := &SubscriptionInfo{
			Tier:              participant.SubscriberTier,
			CumulativeMonths:  participant.SubscribedMonths,
			FinalTicketsLimit: options.FinalTicketsLimit,
		}
		finalTickets := CalculateFinalTickets(baseTickets, subscriptionInfo)

		isExcluded := isLastWinner(participant, options.LastWinner)
		details = append(details, ParticipantDetail{
			Username:         participant.Username,
			BaseTickets:      baseTickets,
			FinalTickets:     finalTickets,
			SubscribedMonths: participant.SubscribedMonths,
			SubscriberTier:   participant.SubscriberTier,
			IsExcluded:       isExcluded,
		})

		if isExcluded || finalTickets <= 0 {
			continue
		}

		totalTickets += finalTickets
		weightedUsers = append(weightedUsers, WeightedUser{
			Username:      participant.Username,
			FinalTickets:  finalTickets,
			CumulativeSum: totalTickets,
			Participant:   participant,
		})
	}

	return weightedUsers, details, totalTickets
}

func isLastWinner(participant types.PresentParticipant, lastWinner string) bool {
	if strings.TrimSpace(lastWinner) == "" {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(participant.Username), strings.TrimSpace(lastWinner))
}

func secureRandomInt(max int) (int, error) {
	if max <= 0 {
		return 0, errInvalidTicketsTotal
	}

	n, err := crand.Int(crand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return 0, err
	}
	return int(n.Int64()), nil
}
