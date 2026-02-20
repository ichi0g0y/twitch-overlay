package lottery

import (
	"fmt"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/types"
)

// GenerateParticipants はN人分のテスト参加者を決定論的に生成する。
func GenerateParticipants(n int) []types.PresentParticipant {
	if n <= 0 {
		return []types.PresentParticipant{}
	}

	participants := make([]types.PresentParticipant, n)
	for i := 0; i < n; i++ {
		participants[i] = GenerateParticipant(i)
	}

	return participants
}

// GenerateParticipant は1人分のテスト参加者を決定論的に生成する。
func GenerateParticipant(index int) types.PresentParticipant {
	if index < 0 {
		index = 0
	}

	isSubscriber := index%2 == 0
	subscriberTier := ""
	if isSubscriber {
		subscriberTier = [...]string{"1000", "2000", "3000"}[index%3]
	}

	return types.PresentParticipant{
		UserID:           fmt.Sprintf("test-user-%03d", index+1),
		Username:         fmt.Sprintf("user_%03d", index+1),
		DisplayName:      fmt.Sprintf("User %03d", index+1),
		RedeemedAt:       time.Unix(0, 0).Add(time.Duration(index) * time.Second),
		IsSubscriber:     isSubscriber,
		SubscribedMonths: (index % 24) + 1,
		SubscriberTier:   subscriberTier,
		EntryCount:       (index % 3) + 1,
	}
}
