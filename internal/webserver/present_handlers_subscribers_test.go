package webserver

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
)

func TestHandleRefreshSubscribers_FailedUsers(t *testing.T) {
	setupLotteryAPITestDB(t)

	db := localdb.GetDB()
	if db == nil {
		t.Fatal("database not initialized")
	}

	sm := settings.NewSettingsManager(db)
	if err := sm.SetSetting("TWITCH_USER_ID", "999999"); err != nil {
		t.Fatalf("SetSetting(TWITCH_USER_ID) failed: %v", err)
	}

	now := time.Now()
	participants := []types.PresentParticipant{
		{
			UserID:           "100",
			Username:         "failure_user",
			DisplayName:      "失敗ユーザー",
			RedeemedAt:       now,
			IsSubscriber:     false,
			SubscribedMonths: 0,
			SubscriberTier:   "",
			EntryCount:       1,
		},
		{
			UserID:           "200",
			Username:         "success_user",
			DisplayName:      "成功ユーザー",
			RedeemedAt:       now.Add(1 * time.Second),
			IsSubscriber:     false,
			SubscribedMonths: 0,
			SubscriberTier:   "",
			EntryCount:       1,
		},
		{
			UserID:           "test-user-id",
			Username:         "non_numeric",
			DisplayName:      "非数値ユーザー",
			RedeemedAt:       now.Add(2 * time.Second),
			IsSubscriber:     false,
			SubscribedMonths: 0,
			SubscriberTier:   "",
			EntryCount:       1,
		},
	}

	for _, p := range participants {
		if err := localdb.AddLotteryParticipant(p); err != nil {
			t.Fatalf("AddLotteryParticipant failed: %v", err)
		}
	}

	original := getUserSubscriptionCached
	getUserSubscriptionCached = func(broadcasterID, userID string) (*twitchapi.UserSubscription, error) {
		switch userID {
		case "100":
			return nil, errors.New("twitch api temporary error")
		case "200":
			return &twitchapi.UserSubscription{
				UserID:           userID,
				Tier:             "1000",
				CumulativeMonths: 6,
			}, nil
		default:
			return nil, twitchapi.ErrUserNotSubscribed
		}
	}
	t.Cleanup(func() {
		getUserSubscriptionCached = original
	})

	req := httptest.NewRequest(http.MethodPost, "/api/present/refresh-subscribers", nil)
	rec := httptest.NewRecorder()
	handleRefreshSubscribers(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status mismatch: got=%d want=%d body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var body struct {
		Success     bool     `json:"success"`
		Updated     int      `json:"updated"`
		FailedUsers []string `json:"failed_users"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !body.Success {
		t.Fatalf("success should be true: %+v", body)
	}
	if body.Updated != 1 {
		t.Fatalf("updated count mismatch: got=%d want=1", body.Updated)
	}
	if len(body.FailedUsers) != 1 {
		t.Fatalf("failed_users count mismatch: got=%d want=1", len(body.FailedUsers))
	}
	if body.FailedUsers[0] != "失敗ユーザー" {
		t.Fatalf("failed user mismatch: got=%q want=%q", body.FailedUsers[0], "失敗ユーザー")
	}
}
