package webserver

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

type MusicControlCommand struct {
	Type     string  `json:"type"`     // play, pause, stop, toggle, next, previous, volume, seek, load_playlist
	Value    int     `json:"value,omitempty"`
	Time     float64 `json:"time,omitempty"`
	Playlist string  `json:"playlist,omitempty"`
}

type MusicStatusUpdate struct {
	PlaybackStatus string  `json:"playback_status,omitempty"` // playing, paused, stopped
	IsPlaying      bool    `json:"is_playing"` // 互換性のため残す
	CurrentTrack   *Track  `json:"current_track,omitempty"`
	Progress       float64 `json:"progress"`
	CurrentTime    float64 `json:"current_time"`
	Duration       float64 `json:"duration"`
	Volume         int     `json:"volume"`
	PlaylistName   *string `json:"playlist_name,omitempty"`
}

type Track struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Artist   string `json:"artist"`
	Album    string `json:"album,omitempty"`
	Duration int    `json:"duration"`
	HasArtwork bool `json:"has_artwork"`
}

var (
	// 現在の音楽再生状態
	currentMusicState = MusicStatusUpdate{
		PlaybackStatus: "stopped",
		IsPlaying:      false,
		Volume:         70,
	}
	musicStateMutex sync.RWMutex
)

// 全クライアントにコマンドを送信
func broadcastMusicCommand(cmd MusicControlCommand) {
	// WebSocketクライアントに送信
	BroadcastWSMessage("music_control", cmd)

	logger.Info("Broadcasting music command",
		zap.String("command", cmd.Type))
}

// 全クライアントにステータスを送信
func broadcastMusicStatus(status MusicStatusUpdate) {
	// WebSocketクライアントに送信
	BroadcastWSMessage("music_status", status)
}

// POST /api/music/control/play
func handleMusicPlay(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cmd := MusicControlCommand{Type: "play"}
	broadcastMusicCommand(cmd)
	logger.Info("Music play command sent")
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// POST /api/music/control/pause
func handleMusicPause(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cmd := MusicControlCommand{Type: "pause"}
	broadcastMusicCommand(cmd)
	logger.Info("Music pause command sent")
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// POST /api/music/control/stop
func handleMusicStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cmd := MusicControlCommand{Type: "stop"}
	broadcastMusicCommand(cmd)
	logger.Info("Music stop command sent")
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// POST /api/music/control/toggle
func handleMusicToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 現在の状態を取得
	currentState := getCurrentMusicState()
	
	var action string
	var cmd MusicControlCommand
	
	if currentState.IsPlaying {
		// 再生中なら停止
		cmd = MusicControlCommand{Type: "pause"}
		action = "pause"
	} else {
		// 停止中なら再生
		cmd = MusicControlCommand{Type: "play"}
		action = "play"
	}
	
	broadcastMusicCommand(cmd)
	logger.Info("Music toggle command sent", zap.String("action", action), zap.Bool("was_playing", currentState.IsPlaying))
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"action": action,
	})
}

// POST /api/music/control/next
func handleMusicNext(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cmd := MusicControlCommand{Type: "next"}
	broadcastMusicCommand(cmd)
	logger.Info("Music next command sent")
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// POST /api/music/control/previous
func handleMusicPrevious(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cmd := MusicControlCommand{Type: "previous"}
	broadcastMusicCommand(cmd)
	logger.Info("Music previous command sent")
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// POST /api/music/control/volume
func handleMusicVolume(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Volume int `json:"volume"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	
	if req.Volume < 0 || req.Volume > 100 {
		http.Error(w, "Volume must be between 0 and 100", http.StatusBadRequest)
		return
	}

	cmd := MusicControlCommand{
		Type:  "volume",
		Value: req.Volume,
	}
	broadcastMusicCommand(cmd)
	logger.Info("Music volume command sent", zap.Int("volume", req.Volume))
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// POST /api/music/control/seek
func handleMusicSeek(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Time float64 `json:"time"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	cmd := MusicControlCommand{
		Type: "seek",
		Time: req.Time,
	}
	broadcastMusicCommand(cmd)
	logger.Info("Music seek command sent", zap.Float64("time", req.Time))
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// POST /api/music/control/load
func handleMusicLoad(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Playlist string `json:"playlist,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	cmd := MusicControlCommand{
		Type:     "load_playlist",
		Playlist: req.Playlist,
	}
	broadcastMusicCommand(cmd)
	logger.Info("Music load playlist command sent", zap.String("playlist", req.Playlist))
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// SSE: /api/music/control/events
// POST /api/music/status/update
func handleMusicStatusUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var status MusicStatusUpdate
	if err := json.NewDecoder(r.Body).Decode(&status); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 現在の状態を更新
	updateCurrentMusicState(status)

	// 全クライアントに状態を配信
	broadcastMusicStatus(status)
	logger.Debug("Music status broadcasted", zap.Bool("is_playing", status.IsPlaying))
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// 現在の音楽状態を更新
func updateCurrentMusicState(status MusicStatusUpdate) {
	musicStateMutex.Lock()
	defer musicStateMutex.Unlock()

	// IsPlayingとPlaybackStatusの同期を確保
	if status.PlaybackStatus == "playing" {
		status.IsPlaying = true
	} else if status.PlaybackStatus == "paused" || status.PlaybackStatus == "stopped" {
		status.IsPlaying = false
	}

	// 逆方向の同期も確保（古いコードとの互換性のため）
	if status.PlaybackStatus == "" {
		if status.IsPlaying {
			status.PlaybackStatus = "playing"
		} else {
			status.PlaybackStatus = "stopped"
		}
	}

	currentMusicState = status
}

// 現在の音楽状態を取得
func getCurrentMusicState() MusicStatusUpdate {
	musicStateMutex.RLock()
	defer musicStateMutex.RUnlock()
	return currentMusicState
}

// GET /api/music/status
func handleMusicStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 現在の音楽状態を取得
	state := getCurrentMusicState()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

// SSE: /api/music/status/events
// RegisterMusicControlRoutes 音楽制御用のルートを登録
func RegisterMusicControlRoutes(mux *http.ServeMux) {
	// 制御エンドポイント
	mux.HandleFunc("/api/music/control/play", corsMiddleware(handleMusicPlay))
	mux.HandleFunc("/api/music/control/pause", corsMiddleware(handleMusicPause))
	mux.HandleFunc("/api/music/control/stop", corsMiddleware(handleMusicStop))
	mux.HandleFunc("/api/music/control/toggle", corsMiddleware(handleMusicToggle))
	mux.HandleFunc("/api/music/control/next", corsMiddleware(handleMusicNext))
	mux.HandleFunc("/api/music/control/previous", corsMiddleware(handleMusicPrevious))
	mux.HandleFunc("/api/music/control/volume", corsMiddleware(handleMusicVolume))
	mux.HandleFunc("/api/music/control/seek", corsMiddleware(handleMusicSeek))
	mux.HandleFunc("/api/music/control/load", corsMiddleware(handleMusicLoad))
	
	// SSEエンドポイント（削除済み - WebSocket一本化）
	// mux.HandleFunc("/api/music/control/events", corsMiddleware(handleMusicControlEvents))

	// 状態同期エンドポイント
	mux.HandleFunc("/api/music/status", corsMiddleware(handleMusicStatus))
	mux.HandleFunc("/api/music/status/update", corsMiddleware(handleMusicStatusUpdate))
	// mux.HandleFunc("/api/music/status/events", corsMiddleware(handleMusicStatusEvents))
}