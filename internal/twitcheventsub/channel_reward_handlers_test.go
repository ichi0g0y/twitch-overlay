package twitcheventsub

import (
	"errors"
	"testing"

	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
)

func TestResolveSubscriptionState_KeepExistingMonthsWhenAPIMonthsUnavailable(t *testing.T) {
	existing := &types.PresentParticipant{
		IsSubscriber:     true,
		SubscriberTier:   "3000",
		SubscribedMonths: 24,
	}

	isSubscriber, tier, months := resolveSubscriptionState(existing, &twitchapi.UserSubscription{
		Tier:             "3000",
		CumulativeMonths: 0,
	}, nil)

	if !isSubscriber {
		t.Fatalf("isSubscriber = false, want true")
	}
	if tier != "3000" {
		t.Fatalf("tier = %q, want %q", tier, "3000")
	}
	if months != 24 {
		t.Fatalf("months = %d, want %d", months, 24)
	}
}

func TestResolveSubscriptionState_KeepExistingOnAPIError(t *testing.T) {
	existing := &types.PresentParticipant{
		IsSubscriber:     true,
		SubscriberTier:   "2000",
		SubscribedMonths: 12,
	}

	isSubscriber, tier, months := resolveSubscriptionState(existing, nil, errors.New("temporary api error"))

	if !isSubscriber {
		t.Fatalf("isSubscriber = false, want true")
	}
	if tier != "2000" {
		t.Fatalf("tier = %q, want %q", tier, "2000")
	}
	if months != 12 {
		t.Fatalf("months = %d, want %d", months, 12)
	}
}

func TestResolveSubscriptionState_ResetOnNotSubscribed(t *testing.T) {
	existing := &types.PresentParticipant{
		IsSubscriber:     true,
		SubscriberTier:   "1000",
		SubscribedMonths: 8,
	}

	isSubscriber, tier, months := resolveSubscriptionState(existing, nil, twitchapi.ErrUserNotSubscribed)

	if isSubscriber {
		t.Fatalf("isSubscriber = true, want false")
	}
	if tier != "" {
		t.Fatalf("tier = %q, want empty", tier)
	}
	if months != 0 {
		t.Fatalf("months = %d, want %d", months, 0)
	}
}
