package twitchapi

import (
	"errors"
	"sync/atomic"
	"testing"
)

func TestGetUserSubscriptionCached_Subscribed(t *testing.T) {
	ClearSubscriptionCache()
	originalFetcher := subscriptionFetcher
	defer func() {
		subscriptionFetcher = originalFetcher
		ClearSubscriptionCache()
	}()

	var callCount int32
	subscriptionFetcher = func(broadcasterID, userID string) (*UserSubscription, error) {
		atomic.AddInt32(&callCount, 1)
		return &UserSubscription{
			UserID:           userID,
			UserName:         "tester",
			UserLogin:        "tester",
			Tier:             "1000",
			CumulativeMonths: 6,
		}, nil
	}

	first, err := GetUserSubscriptionCached("b1", "u1")
	if err != nil {
		t.Fatalf("first call failed: %v", err)
	}
	second, err := GetUserSubscriptionCached("b1", "u1")
	if err != nil {
		t.Fatalf("second call failed: %v", err)
	}

	if atomic.LoadInt32(&callCount) != 1 {
		t.Fatalf("unexpected fetch count: got=%d want=1", callCount)
	}
	if first == second {
		t.Fatalf("subscription pointer should be cloned")
	}
	if second.CumulativeMonths != 6 {
		t.Fatalf("unexpected CumulativeMonths: got=%d want=6", second.CumulativeMonths)
	}
}

func TestGetUserSubscriptionCached_NotSubscribed(t *testing.T) {
	ClearSubscriptionCache()
	originalFetcher := subscriptionFetcher
	defer func() {
		subscriptionFetcher = originalFetcher
		ClearSubscriptionCache()
	}()

	var callCount int32
	subscriptionFetcher = func(broadcasterID, userID string) (*UserSubscription, error) {
		atomic.AddInt32(&callCount, 1)
		return nil, ErrUserNotSubscribed
	}

	_, err := GetUserSubscriptionCached("b2", "u2")
	if !errors.Is(err, ErrUserNotSubscribed) {
		t.Fatalf("unexpected first error: %v", err)
	}
	_, err = GetUserSubscriptionCached("b2", "u2")
	if !errors.Is(err, ErrUserNotSubscribed) {
		t.Fatalf("unexpected second error: %v", err)
	}

	if atomic.LoadInt32(&callCount) != 1 {
		t.Fatalf("unexpected fetch count for not-subscribed: got=%d want=1", callCount)
	}
}

func TestGetUserSubscriptionCached_ErrorNoCache(t *testing.T) {
	ClearSubscriptionCache()
	originalFetcher := subscriptionFetcher
	defer func() {
		subscriptionFetcher = originalFetcher
		ClearSubscriptionCache()
	}()

	var callCount int32
	expectedErr := errors.New("temporary API error")
	subscriptionFetcher = func(broadcasterID, userID string) (*UserSubscription, error) {
		atomic.AddInt32(&callCount, 1)
		return nil, expectedErr
	}

	_, err := GetUserSubscriptionCached("b3", "u3")
	if !errors.Is(err, expectedErr) {
		t.Fatalf("unexpected first error: %v", err)
	}
	_, err = GetUserSubscriptionCached("b3", "u3")
	if !errors.Is(err, expectedErr) {
		t.Fatalf("unexpected second error: %v", err)
	}

	if atomic.LoadInt32(&callCount) != 2 {
		t.Fatalf("error should not be cached: got=%d want=2", callCount)
	}
}

func TestResolveSubscribedMonths(t *testing.T) {
	tests := []struct {
		name     string
		api      int
		current  int
		expected int
	}{
		{
			name:     "use api months when available",
			api:      12,
			current:  3,
			expected: 12,
		},
		{
			name:     "fallback to current months when api is unavailable",
			api:      0,
			current:  9,
			expected: 9,
		},
		{
			name:     "default to one month when both are unavailable",
			api:      0,
			current:  0,
			expected: 1,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := ResolveSubscribedMonths(tc.api, tc.current)
			if got != tc.expected {
				t.Fatalf("ResolveSubscribedMonths(%d, %d) = %d, want %d", tc.api, tc.current, got, tc.expected)
			}
		})
	}
}
