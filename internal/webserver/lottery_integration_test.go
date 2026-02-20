package webserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/lottery"
	"github.com/ichi0g0y/twitch-overlay/internal/types"
)

func setupIntegrationTestDB(t *testing.T) {
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

func generateTestParticipants(n int) []types.PresentParticipant {
	if n <= 0 {
		return []types.PresentParticipant{}
	}

	baseTime := time.Unix(1_700_000_000, 0)
	participants := make([]types.PresentParticipant, n)

	for i := 0; i < n; i++ {
		isSubscriber := i%2 == 0
		tier := ""
		if isSubscriber {
			tier = [...]string{"1000", "2000", "3000"}[i%3]
		}

		participants[i] = types.PresentParticipant{
			UserID:           fmt.Sprintf("integration-user-%03d", i+1),
			Username:         fmt.Sprintf("integration_user_%03d", i+1),
			DisplayName:      fmt.Sprintf("Integration User %03d", i+1),
			RedeemedAt:       baseTime.Add(time.Duration(i) * time.Second),
			IsSubscriber:     isSubscriber,
			SubscribedMonths: (i % 24) + 1,
			SubscriberTier:   tier,
			EntryCount:       (i % 3) + 1,
		}
	}

	return participants
}

func addParticipantsToDB(t *testing.T, participants []types.PresentParticipant) {
	t.Helper()

	for _, participant := range participants {
		if err := localdb.AddLotteryParticipant(participant); err != nil {
			t.Fatalf("AddLotteryParticipant failed: %v", err)
		}
	}
}

func TestIntegration_FullDrawFlow(t *testing.T) {
	setupIntegrationTestDB(t)

	participants := generateTestParticipants(5)
	addParticipantsToDB(t, participants)

	getReq := httptest.NewRequest(http.MethodGet, "/api/present/participants", nil)
	getRec := httptest.NewRecorder()
	handlePresentParticipants(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("GET participants status mismatch: got=%d want=%d", getRec.Code, http.StatusOK)
	}

	var participantsResp struct {
		Participants []types.PresentParticipant `json:"participants"`
	}
	if err := json.NewDecoder(getRec.Body).Decode(&participantsResp); err != nil {
		t.Fatalf("decode participants response failed: %v", err)
	}
	if len(participantsResp.Participants) != 5 {
		t.Fatalf("participants count mismatch: got=%d want=%d", len(participantsResp.Participants), 5)
	}

	startReq := httptest.NewRequest(http.MethodPost, "/api/present/start", nil)
	startRec := httptest.NewRecorder()
	handlePresentStart(startRec, startReq)
	if startRec.Code != http.StatusOK {
		t.Fatalf("start status mismatch: got=%d want=%d body=%s", startRec.Code, http.StatusOK, startRec.Body.String())
	}
	if !currentLottery.IsRunning {
		t.Fatalf("currentLottery.IsRunning should be true after start")
	}

	stopReq := httptest.NewRequest(http.MethodPost, "/api/present/stop", nil)
	stopRec := httptest.NewRecorder()
	handlePresentStop(stopRec, stopReq)
	if stopRec.Code != http.StatusOK {
		t.Fatalf("stop status mismatch: got=%d want=%d body=%s", stopRec.Code, http.StatusOK, stopRec.Body.String())
	}

	var stopResp struct {
		Winner *types.PresentParticipant `json:"winner"`
	}
	if err := json.NewDecoder(stopRec.Body).Decode(&stopResp); err != nil {
		t.Fatalf("decode stop response failed: %v", err)
	}
	if stopResp.Winner == nil {
		t.Fatalf("winner should not be nil")
	}
	if currentLottery.IsRunning {
		t.Fatalf("currentLottery.IsRunning should be false after stop")
	}

	history, err := localdb.GetLotteryHistory(0)
	if err != nil {
		t.Fatalf("GetLotteryHistory failed: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("history count mismatch: got=%d want=%d", len(history), 1)
	}
	if history[0].WinnerName != stopResp.Winner.Username {
		t.Fatalf("winner_name mismatch: got=%q want=%q", history[0].WinnerName, stopResp.Winner.Username)
	}

	settings, err := localdb.GetLotterySettings()
	if err != nil {
		t.Fatalf("GetLotterySettings failed: %v", err)
	}
	if settings.LastWinner != stopResp.Winner.Username {
		t.Fatalf("last winner mismatch: got=%q want=%q", settings.LastWinner, stopResp.Winner.Username)
	}
}

func TestIntegration_SettingsPropagation(t *testing.T) {
	setupIntegrationTestDB(t)

	participants := generateTestParticipants(6)
	for i := range participants {
		participants[i].EntryCount = 3
		participants[i].IsSubscriber = true
		participants[i].SubscriberTier = "3000"
		participants[i].SubscribedMonths = 24
	}
	addParticipantsToDB(t, participants)

	putReq := httptest.NewRequest(http.MethodPut, "/api/lottery/settings",
		strings.NewReader(`{"base_tickets_limit":3,"final_tickets_limit":3}`))
	putRec := httptest.NewRecorder()
	handleLotterySettings(putRec, putReq)
	if putRec.Code != http.StatusOK {
		t.Fatalf("settings update status mismatch: got=%d want=%d body=%s", putRec.Code, http.StatusOK, putRec.Body.String())
	}

	drawReq := httptest.NewRequest(http.MethodPost, "/api/lottery/draw", nil)
	drawRec := httptest.NewRecorder()
	handleLotteryDraw(drawRec, drawReq)
	if drawRec.Code != http.StatusOK {
		t.Fatalf("draw status mismatch: got=%d want=%d body=%s", drawRec.Code, http.StatusOK, drawRec.Body.String())
	}

	var drawResp struct {
		ParticipantsDetail []lottery.ParticipantDetail `json:"participants_detail"`
	}
	if err := json.NewDecoder(drawRec.Body).Decode(&drawResp); err != nil {
		t.Fatalf("decode draw response failed: %v", err)
	}
	if len(drawResp.ParticipantsDetail) == 0 {
		t.Fatalf("participants_detail should not be empty")
	}
	for _, detail := range drawResp.ParticipantsDetail {
		if detail.FinalTickets > 3 {
			t.Fatalf("final_tickets should be capped: username=%q got=%d want<=3", detail.Username, detail.FinalTickets)
		}
	}
}

func TestIntegration_DrawWithLastWinnerExclusion(t *testing.T) {
	setupIntegrationTestDB(t)

	baseTime := time.Unix(1_700_000_000, 0)
	participants := []types.PresentParticipant{
		{
			UserID:           "100",
			Username:         "alice",
			DisplayName:      "Alice",
			RedeemedAt:       baseTime,
			IsSubscriber:     false,
			SubscribedMonths: 0,
			SubscriberTier:   "",
			EntryCount:       1,
		},
		{
			UserID:           "200",
			Username:         "bob",
			DisplayName:      "Bob",
			RedeemedAt:       baseTime.Add(1 * time.Second),
			IsSubscriber:     false,
			SubscribedMonths: 0,
			SubscriberTier:   "",
			EntryCount:       1,
		},
	}
	addParticipantsToDB(t, participants)

	err := localdb.UpdateLotterySettings(localdb.LotterySettings{
		BaseTicketsLimit:  3,
		FinalTicketsLimit: 0,
		LastWinner:        "alice",
	})
	if err != nil {
		t.Fatalf("UpdateLotterySettings failed: %v", err)
	}

	startReq := httptest.NewRequest(http.MethodPost, "/api/present/start", nil)
	startRec := httptest.NewRecorder()
	handlePresentStart(startRec, startReq)
	if startRec.Code != http.StatusOK {
		t.Fatalf("start status mismatch: got=%d want=%d body=%s", startRec.Code, http.StatusOK, startRec.Body.String())
	}

	stopReq := httptest.NewRequest(http.MethodPost, "/api/present/stop", nil)
	stopRec := httptest.NewRecorder()
	handlePresentStop(stopRec, stopReq)
	if stopRec.Code != http.StatusOK {
		t.Fatalf("stop status mismatch: got=%d want=%d body=%s", stopRec.Code, http.StatusOK, stopRec.Body.String())
	}

	var stopResp struct {
		Winner             *types.PresentParticipant   `json:"winner"`
		ParticipantsDetail []lottery.ParticipantDetail `json:"participants_detail"`
	}
	if err := json.NewDecoder(stopRec.Body).Decode(&stopResp); err != nil {
		t.Fatalf("decode stop response failed: %v", err)
	}
	if stopResp.Winner == nil {
		t.Fatalf("winner should not be nil")
	}
	if stopResp.Winner.Username != "bob" {
		t.Fatalf("winner mismatch: got=%q want=%q", stopResp.Winner.Username, "bob")
	}

	foundExcludedAlice := false
	for _, detail := range stopResp.ParticipantsDetail {
		if detail.Username == "alice" && detail.IsExcluded {
			foundExcludedAlice = true
			break
		}
	}
	if !foundExcludedAlice {
		t.Fatalf("alice should be marked as excluded in participants_detail")
	}
}

func TestIntegration_100ParticipantsDraw(t *testing.T) {
	setupIntegrationTestDB(t)

	participants := generateTestParticipants(100)
	addParticipantsToDB(t, participants)

	started := time.Now()
	drawReq := httptest.NewRequest(http.MethodPost, "/api/lottery/draw", nil)
	drawRec := httptest.NewRecorder()
	handleLotteryDraw(drawRec, drawReq)
	elapsed := time.Since(started)

	if drawRec.Code != http.StatusOK {
		t.Fatalf("draw status mismatch: got=%d want=%d body=%s", drawRec.Code, http.StatusOK, drawRec.Body.String())
	}
	if elapsed > time.Second {
		t.Fatalf("draw should complete within 1 second: elapsed=%s", elapsed)
	}

	var drawResp struct {
		TotalParticipants int `json:"total_participants"`
	}
	if err := json.NewDecoder(drawRec.Body).Decode(&drawResp); err != nil {
		t.Fatalf("decode draw response failed: %v", err)
	}
	if drawResp.TotalParticipants != 100 {
		t.Fatalf("total_participants mismatch: got=%d want=%d", drawResp.TotalParticipants, 100)
	}

	history, err := localdb.GetLotteryHistory(1)
	if err != nil {
		t.Fatalf("GetLotteryHistory failed: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("history count mismatch: got=%d want=%d", len(history), 1)
	}
	if history[0].TotalParticipants != 100 {
		t.Fatalf("history total_participants mismatch: got=%d want=%d", history[0].TotalParticipants, 100)
	}
}
