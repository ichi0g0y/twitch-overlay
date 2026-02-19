package localdb

import (
	"path/filepath"
	"testing"
	"time"
)

func TestLotterySettingsAndHistoryCRUD(t *testing.T) {
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

	initial, err := GetLotterySettings()
	if err != nil {
		t.Fatalf("GetLotterySettings failed: %v", err)
	}
	if initial.BaseTicketsLimit != 3 {
		t.Fatalf("unexpected default BaseTicketsLimit: got=%d want=3", initial.BaseTicketsLimit)
	}
	if initial.FinalTicketsLimit != 0 {
		t.Fatalf("unexpected default FinalTicketsLimit: got=%d want=0", initial.FinalTicketsLimit)
	}

	err = UpdateLotterySettings(LotterySettings{
		RewardID:          "reward-1",
		LastWinner:        "alice",
		BaseTicketsLimit:  5,
		FinalTicketsLimit: 9,
	})
	if err != nil {
		t.Fatalf("UpdateLotterySettings failed: %v", err)
	}

	updated, err := GetLotterySettings()
	if err != nil {
		t.Fatalf("GetLotterySettings after update failed: %v", err)
	}
	if updated.RewardID != "reward-1" {
		t.Fatalf("unexpected RewardID: got=%q want=%q", updated.RewardID, "reward-1")
	}
	if updated.LastWinner != "alice" {
		t.Fatalf("unexpected LastWinner: got=%q want=%q", updated.LastWinner, "alice")
	}
	if updated.BaseTicketsLimit != 5 {
		t.Fatalf("unexpected BaseTicketsLimit: got=%d want=5", updated.BaseTicketsLimit)
	}
	if updated.FinalTicketsLimit != 9 {
		t.Fatalf("unexpected FinalTicketsLimit: got=%d want=9", updated.FinalTicketsLimit)
	}

	if err := ResetLastWinner(); err != nil {
		t.Fatalf("ResetLastWinner failed: %v", err)
	}

	afterReset, err := GetLotterySettings()
	if err != nil {
		t.Fatalf("GetLotterySettings after reset failed: %v", err)
	}
	if afterReset.LastWinner != "" {
		t.Fatalf("last winner was not reset: got=%q", afterReset.LastWinner)
	}

	now := time.Now()
	if err := SaveLotteryHistory(LotteryHistory{
		WinnerName:        "bob",
		TotalParticipants: 4,
		TotalTickets:      10,
		ParticipantsJSON:  `[{"username":"bob","final_tickets":4}]`,
		RewardIDsJSON:     `["reward-1"]`,
		DrawnAt:           now.Add(-1 * time.Minute),
	}); err != nil {
		t.Fatalf("SaveLotteryHistory first failed: %v", err)
	}

	if err := SaveLotteryHistory(LotteryHistory{
		WinnerName:        "carol",
		TotalParticipants: 5,
		TotalTickets:      12,
		ParticipantsJSON:  `[{"username":"carol","final_tickets":5}]`,
		RewardIDsJSON:     `["reward-1","reward-2"]`,
		DrawnAt:           now,
	}); err != nil {
		t.Fatalf("SaveLotteryHistory second failed: %v", err)
	}

	history, err := GetLotteryHistory(1)
	if err != nil {
		t.Fatalf("GetLotteryHistory(limit=1) failed: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("unexpected history length for limit=1: got=%d want=1", len(history))
	}
	if history[0].WinnerName != "carol" {
		t.Fatalf("history order mismatch: got=%q want=%q", history[0].WinnerName, "carol")
	}

	fullHistory, err := GetLotteryHistory(0)
	if err != nil {
		t.Fatalf("GetLotteryHistory(limit=0) failed: %v", err)
	}
	if len(fullHistory) != 2 {
		t.Fatalf("unexpected full history length: got=%d want=2", len(fullHistory))
	}

	if err := DeleteLotteryHistory(fullHistory[0].ID); err != nil {
		t.Fatalf("DeleteLotteryHistory failed: %v", err)
	}

	afterDelete, err := GetLotteryHistory(0)
	if err != nil {
		t.Fatalf("GetLotteryHistory after delete failed: %v", err)
	}
	if len(afterDelete) != 1 {
		t.Fatalf("unexpected history length after delete: got=%d want=1", len(afterDelete))
	}
}
