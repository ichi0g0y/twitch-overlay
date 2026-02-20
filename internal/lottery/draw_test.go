package lottery

import (
	"errors"
	"testing"

	"github.com/ichi0g0y/twitch-overlay/internal/types"
)

func TestDrawLottery_NoParticipants(t *testing.T) {
	_, err := DrawLottery(nil, DrawOptions{})
	if !errors.Is(err, ErrNoParticipants) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDrawLottery_ExcludeLastWinner(t *testing.T) {
	originalRandom := drawRandomInt
	drawRandomInt = func(max int) (int, error) {
		return 0, nil
	}
	defer func() {
		drawRandomInt = originalRandom
	}()

	participants := []types.PresentParticipant{
		{
			UserID:           "1",
			Username:         "alice",
			DisplayName:      "Alice",
			EntryCount:       3,
			IsSubscriber:     true,
			SubscriberTier:   "1000",
			SubscribedMonths: 6,
		},
		{
			UserID:           "2",
			Username:         "bob",
			DisplayName:      "Bob",
			EntryCount:       1,
			IsSubscriber:     true,
			SubscriberTier:   "1000",
			SubscribedMonths: 1,
		},
	}

	result, err := DrawLottery(participants, DrawOptions{
		BaseTicketsLimit:  3,
		FinalTicketsLimit: 0,
		LastWinner:        "alice",
	})
	if err != nil {
		t.Fatalf("DrawLottery failed: %v", err)
	}
	if result.Winner == nil {
		t.Fatalf("winner should not be nil")
	}
	if result.Winner.Username != "bob" {
		t.Fatalf("unexpected winner: got=%q want=%q", result.Winner.Username, "bob")
	}

	if len(result.ParticipantsDetail) != 2 {
		t.Fatalf("unexpected detail count: got=%d want=2", len(result.ParticipantsDetail))
	}
	if !result.ParticipantsDetail[0].IsExcluded {
		t.Fatalf("last winner should be excluded")
	}
}

func TestDrawLottery_WeightedSelection(t *testing.T) {
	originalRandom := drawRandomInt
	defer func() {
		drawRandomInt = originalRandom
	}()

	participants := []types.PresentParticipant{
		{
			UserID:           "1",
			Username:         "alice",
			DisplayName:      "Alice",
			EntryCount:       1,
			IsSubscriber:     true,
			SubscriberTier:   "1000",
			SubscribedMonths: 1, // final 2 tickets
		},
		{
			UserID:           "2",
			Username:         "bob",
			DisplayName:      "Bob",
			EntryCount:       3,
			IsSubscriber:     true,
			SubscriberTier:   "3000",
			SubscribedMonths: 12, // final 9 tickets
		},
	}

	drawRandomInt = func(max int) (int, error) {
		if max != 11 {
			t.Fatalf("unexpected max tickets: got=%d want=11", max)
		}
		return 10, nil // 11th ticket => bob
	}

	result, err := DrawLottery(participants, DrawOptions{
		BaseTicketsLimit:  3,
		FinalTicketsLimit: 0,
	})
	if err != nil {
		t.Fatalf("DrawLottery failed: %v", err)
	}
	if result.Winner == nil {
		t.Fatalf("winner should not be nil")
	}
	if result.Winner.Username != "bob" {
		t.Fatalf("unexpected winner: got=%q want=%q", result.Winner.Username, "bob")
	}
	if result.TotalTickets != 11 {
		t.Fatalf("unexpected total tickets: got=%d want=11", result.TotalTickets)
	}
}

func TestDrawLottery_NoEligibleParticipants(t *testing.T) {
	participants := []types.PresentParticipant{
		{
			UserID:           "1",
			Username:         "alice",
			DisplayName:      "Alice",
			EntryCount:       1,
			IsSubscriber:     false,
			SubscriberTier:   "",
			SubscribedMonths: 0,
		},
	}

	_, err := DrawLottery(participants, DrawOptions{
		BaseTicketsLimit:  0,
		FinalTicketsLimit: 0,
		LastWinner:        "alice",
	})
	if !errors.Is(err, ErrNoEligibleUser) {
		t.Fatalf("unexpected error: %v", err)
	}
}
