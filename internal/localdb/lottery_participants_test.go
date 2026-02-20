package localdb

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/types"
)

func setupParticipantsTestDB(t *testing.T) {
	t.Helper()

	if DBClient != nil {
		_ = DBClient.Close()
		DBClient = nil
	}

	dbPath := filepath.Join(t.TempDir(), "local.db")
	db, err := SetupDB(dbPath)
	if err != nil {
		t.Fatalf("SetupDB failed: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
		DBClient = nil
	})
}

func TestLotteryParticipantEntryCountUsesBaseTicketsLimit(t *testing.T) {
	setupParticipantsTestDB(t)

	if err := UpdateLotterySettings(LotterySettings{BaseTicketsLimit: 5}); err != nil {
		t.Fatalf("UpdateLotterySettings failed: %v", err)
	}

	now := time.Now()
	participant := types.PresentParticipant{
		UserID:      "user-1",
		Username:    "alice",
		DisplayName: "Alice",
		RedeemedAt:  now,
		EntryCount:  1,
	}

	for i := 0; i < 7; i++ {
		if err := AddLotteryParticipant(participant); err != nil {
			t.Fatalf("AddLotteryParticipant failed: %v", err)
		}
	}

	participants, err := GetAllLotteryParticipants()
	if err != nil {
		t.Fatalf("GetAllLotteryParticipants failed: %v", err)
	}
	if len(participants) != 1 {
		t.Fatalf("unexpected participants count: got=%d want=1", len(participants))
	}
	if participants[0].EntryCount != 5 {
		t.Fatalf("entry_count should be capped by base_tickets_limit: got=%d want=5", participants[0].EntryCount)
	}
}

func TestUpdateLotteryParticipantEntryCountUsesBaseTicketsLimit(t *testing.T) {
	setupParticipantsTestDB(t)

	if err := UpdateLotterySettings(LotterySettings{BaseTicketsLimit: 5}); err != nil {
		t.Fatalf("UpdateLotterySettings failed: %v", err)
	}

	now := time.Now()
	participant := types.PresentParticipant{
		UserID:      "user-2",
		Username:    "bob",
		DisplayName: "Bob",
		RedeemedAt:  now,
		EntryCount:  1,
	}
	if err := AddLotteryParticipant(participant); err != nil {
		t.Fatalf("AddLotteryParticipant failed: %v", err)
	}

	participant.EntryCount = 8
	if err := UpdateLotteryParticipant(participant.UserID, participant); err != nil {
		t.Fatalf("UpdateLotteryParticipant failed: %v", err)
	}

	participants, err := GetAllLotteryParticipants()
	if err != nil {
		t.Fatalf("GetAllLotteryParticipants failed: %v", err)
	}
	if len(participants) != 1 {
		t.Fatalf("unexpected participants count: got=%d want=1", len(participants))
	}
	if participants[0].EntryCount != 5 {
		t.Fatalf("entry_count should be capped by base_tickets_limit on update: got=%d want=5", participants[0].EntryCount)
	}
}

func TestFixEntryCountsOver3UsesCurrentBaseTicketsLimit(t *testing.T) {
	setupParticipantsTestDB(t)

	if err := UpdateLotterySettings(LotterySettings{BaseTicketsLimit: 6}); err != nil {
		t.Fatalf("UpdateLotterySettings failed: %v", err)
	}

	db := GetDB()
	if db == nil {
		t.Fatal("database not initialized")
	}

	now := time.Now()
	_, err := db.Exec(`
		INSERT INTO lottery_participants (
			user_id, username, display_name, avatar_url, redeemed_at,
			is_subscriber, subscribed_months, subscriber_tier, entry_count, assigned_color
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"user-3",
		"carol",
		"Carol",
		"",
		now,
		false,
		0,
		"",
		10,
		"",
	)
	if err != nil {
		t.Fatalf("failed to seed participant: %v", err)
	}

	if err := FixEntryCountsOver3(); err != nil {
		t.Fatalf("FixEntryCountsOver3 failed: %v", err)
	}

	participants, err := GetAllLotteryParticipants()
	if err != nil {
		t.Fatalf("GetAllLotteryParticipants failed: %v", err)
	}
	if len(participants) != 1 {
		t.Fatalf("unexpected participants count: got=%d want=1", len(participants))
	}
	if participants[0].EntryCount != 6 {
		t.Fatalf("entry_count should be capped by current base_tickets_limit: got=%d want=6", participants[0].EntryCount)
	}
}
