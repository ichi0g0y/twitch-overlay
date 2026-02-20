package webserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
)

func setupLotteryAPITestDB(t *testing.T) {
	t.Helper()

	if localdb.DBClient != nil {
		_ = localdb.DBClient.Close()
		localdb.DBClient = nil
	}

	dbPath := filepath.Join(t.TempDir(), "local.db")
	db, err := localdb.SetupDB(dbPath)
	if err != nil {
		t.Fatalf("SetupDB failed: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
		localdb.DBClient = nil
	})

	currentLottery.IsRunning = false
	currentLottery.IsLocked = false
	currentLottery.StartedAt = nil
	currentLottery.Winner = nil
	currentLottery.Participants = []types.PresentParticipant{}
}

func TestHandleLotterySettings_GetAndPut(t *testing.T) {
	setupLotteryAPITestDB(t)

	getReq := httptest.NewRequest(http.MethodGet, "/api/lottery/settings", nil)
	getRec := httptest.NewRecorder()
	handleLotterySettings(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("GET status mismatch: got=%d want=%d", getRec.Code, http.StatusOK)
	}

	putBody := `{"reward_id":"reward-1","base_tickets_limit":5,"final_tickets_limit":9}`
	putReq := httptest.NewRequest(http.MethodPut, "/api/lottery/settings", strings.NewReader(putBody))
	putRec := httptest.NewRecorder()
	handleLotterySettings(putRec, putReq)

	if putRec.Code != http.StatusOK {
		t.Fatalf("PUT status mismatch: got=%d want=%d body=%s", putRec.Code, http.StatusOK, putRec.Body.String())
	}

	updated, err := localdb.GetLotterySettings()
	if err != nil {
		t.Fatalf("GetLotterySettings failed: %v", err)
	}

	if updated.RewardID != "reward-1" {
		t.Fatalf("unexpected RewardID: got=%q want=%q", updated.RewardID, "reward-1")
	}
	if updated.BaseTicketsLimit != 5 {
		t.Fatalf("unexpected BaseTicketsLimit: got=%d want=%d", updated.BaseTicketsLimit, 5)
	}
	if updated.FinalTicketsLimit != 9 {
		t.Fatalf("unexpected FinalTicketsLimit: got=%d want=%d", updated.FinalTicketsLimit, 9)
	}
}

func TestHandleLotteryResetWinner(t *testing.T) {
	setupLotteryAPITestDB(t)

	err := localdb.UpdateLotterySettings(localdb.LotterySettings{
		RewardID:          "reward-1",
		LastWinner:        "alice",
		BaseTicketsLimit:  3,
		FinalTicketsLimit: 0,
	})
	if err != nil {
		t.Fatalf("UpdateLotterySettings failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/lottery/reset-winner", nil)
	rec := httptest.NewRecorder()
	handleLotteryResetWinner(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status mismatch: got=%d want=%d", rec.Code, http.StatusOK)
	}

	settings, err := localdb.GetLotterySettings()
	if err != nil {
		t.Fatalf("GetLotterySettings failed: %v", err)
	}
	if settings.LastWinner != "" {
		t.Fatalf("last_winner should be reset: got=%q", settings.LastWinner)
	}
}

func TestHandleLotteryHistory_GetAndDelete(t *testing.T) {
	setupLotteryAPITestDB(t)

	now := time.Now()
	if err := localdb.SaveLotteryHistory(localdb.LotteryHistory{
		WinnerName:        "alice",
		TotalParticipants: 3,
		TotalTickets:      5,
		ParticipantsJSON:  `[]`,
		RewardIDsJSON:     `[]`,
		DrawnAt:           now,
	}); err != nil {
		t.Fatalf("SaveLotteryHistory first failed: %v", err)
	}
	if err := localdb.SaveLotteryHistory(localdb.LotteryHistory{
		WinnerName:        "bob",
		TotalParticipants: 4,
		TotalTickets:      7,
		ParticipantsJSON:  `[]`,
		RewardIDsJSON:     `[]`,
		DrawnAt:           now.Add(1 * time.Second),
	}); err != nil {
		t.Fatalf("SaveLotteryHistory second failed: %v", err)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/lottery/history?limit=1", nil)
	getRec := httptest.NewRecorder()
	handleLotteryHistory(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("GET status mismatch: got=%d want=%d", getRec.Code, http.StatusOK)
	}

	var historyResp struct {
		History []localdb.LotteryHistory `json:"history"`
	}
	if err := json.NewDecoder(getRec.Body).Decode(&historyResp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if len(historyResp.History) != 1 {
		t.Fatalf("unexpected history length: got=%d want=%d", len(historyResp.History), 1)
	}

	historyAll, err := localdb.GetLotteryHistory(0)
	if err != nil {
		t.Fatalf("GetLotteryHistory failed: %v", err)
	}
	if len(historyAll) != 2 {
		t.Fatalf("unexpected history length before delete: got=%d want=%d", len(historyAll), 2)
	}

	deleteURL := "/api/lottery/history/" + strconv.Itoa(historyAll[0].ID)
	delReq := httptest.NewRequest(http.MethodDelete, deleteURL, nil)
	delRec := httptest.NewRecorder()
	handleLotteryHistoryItem(delRec, delReq)

	if delRec.Code != http.StatusOK {
		t.Fatalf("DELETE status mismatch: got=%d want=%d body=%s", delRec.Code, http.StatusOK, delRec.Body.String())
	}

	afterDelete, err := localdb.GetLotteryHistory(0)
	if err != nil {
		t.Fatalf("GetLotteryHistory after delete failed: %v", err)
	}
	if len(afterDelete) != 1 {
		t.Fatalf("unexpected history length after delete: got=%d want=%d", len(afterDelete), 1)
	}
}

func TestHandleLotteryDraw(t *testing.T) {
	setupLotteryAPITestDB(t)

	err := localdb.AddLotteryParticipant(types.PresentParticipant{
		UserID:           "1",
		Username:         "alice",
		DisplayName:      "Alice",
		RedeemedAt:       time.Now(),
		IsSubscriber:     false,
		SubscribedMonths: 0,
		SubscriberTier:   "",
		EntryCount:       1,
		AssignedColor:    "#ffffff",
	})
	if err != nil {
		t.Fatalf("AddLotteryParticipant failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/lottery/draw", nil)
	rec := httptest.NewRecorder()
	handleLotteryDraw(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status mismatch: got=%d want=%d body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var drawResp map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&drawResp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if ok, _ := drawResp["success"].(bool); !ok {
		t.Fatalf("success should be true: response=%v", drawResp)
	}

	history, err := localdb.GetLotteryHistory(0)
	if err != nil {
		t.Fatalf("GetLotteryHistory failed: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("draw should save history: got=%d want=%d", len(history), 1)
	}
}
