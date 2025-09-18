package webserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// 開発環境では全てのオリジンを許可
		// TODO: 本番環境では適切なオリジンチェックを実装
		return true
	},
}

// Client represents a WebSocket client with a mutex for thread-safe writes
type Client struct {
	conn  *websocket.Conn
	mu    sync.Mutex
	send  chan logger.LogEntry
}

// WebSocket接続を管理
type LogStreamer struct {
	clients    map[*Client]bool
	broadcast  chan logger.LogEntry
	register   chan *Client
	unregister chan *Client
}

var logStreamer = &LogStreamer{
	clients:    make(map[*Client]bool),
	broadcast:  make(chan logger.LogEntry),
	register:   make(chan *Client),
	unregister: make(chan *Client),
}

func init() {
	go logStreamer.run()
	
	// Set up the broadcast callback
	logger.SetBroadcastCallback(func(entry logger.LogEntry) {
		BroadcastLog(entry)
	})
}

func (ls *LogStreamer) run() {
	for {
		select {
		case client := <-ls.register:
			ls.clients[client] = true
			logger.Info("WebSocket client connected for logs")

		case client := <-ls.unregister:
			if _, ok := ls.clients[client]; ok {
				delete(ls.clients, client)
				close(client.send)
				client.conn.Close()
				logger.Info("WebSocket client disconnected from logs")
			}

		case entry := <-ls.broadcast:
			for client := range ls.clients {
				select {
				case client.send <- entry:
				default:
					// クライアントのsendチャネルがブロックされている場合はスキップ
					logger.Warn("Client send channel blocked, skipping")
				}
			}
		}
	}
}

// BroadcastLog sends a log entry to all connected WebSocket clients
func BroadcastLog(entry logger.LogEntry) {
	select {
	case logStreamer.broadcast <- entry:
	default:
		// チャネルがブロックされている場合はスキップ
	}
}

// handleLogs returns recent logs
func handleLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// クエリパラメータから件数を取得
	limitStr := r.URL.Query().Get("limit")
	limit := 100 // デフォルト100件
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	// ログバッファから取得
	buffer := logger.GetLogBuffer()
	logs := buffer.GetRecent(limit)

	// レスポンス
	response := map[string]interface{}{
		"logs":      logs,
		"count":     len(logs),
		"timestamp": time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleLogsDownload downloads logs as a file
func handleLogsDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}

	buffer := logger.GetLogBuffer()
	
	switch format {
	case "json":
		data, err := buffer.ToJSON()
		if err != nil {
			http.Error(w, "Failed to generate JSON", http.StatusInternalServerError)
			return
		}
		
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=twitch-overlay-logs-%s.json", time.Now().Format("20060102-150405")))
		w.Write(data)
		
	case "text":
		data := buffer.ToText()
		
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=twitch-overlay-logs-%s.txt", time.Now().Format("20060102-150405")))
		w.Write([]byte(data))
		
	default:
		http.Error(w, "Invalid format. Use 'json' or 'text'", http.StatusBadRequest)
	}
}

// handleLogsStream provides real-time log streaming via WebSocket
func handleLogsStream(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("Failed to upgrade to WebSocket", zap.Error(err))
		return
	}

	// クライアントを作成
	client := &Client{
		conn: conn,
		send: make(chan logger.LogEntry, 256), // バッファ付きチャネル
	}

	// クライアントを登録
	logStreamer.register <- client

	// 接続を維持
	defer func() {
		logStreamer.unregister <- client
	}()

	// 最近のログを送信チャネルに送る
	buffer := logger.GetLogBuffer()
	recentLogs := buffer.GetRecent(50)
	for _, log := range recentLogs {
		select {
		case client.send <- log:
		default:
			// バッファが満杯の場合はスキップ
		}
	}

	// 書き込みgoroutineを開始
	go client.writePump()

	// クライアントからのメッセージを読み続ける（接続維持のため）
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

// writePump handles writing messages to the WebSocket connection
func (c *Client) writePump() {
	defer c.conn.Close()

	for {
		select {
		case entry, ok := <-c.send:
			if !ok {
				// sendチャネルが閉じられた
				return
			}

			// Mutexでロックして書き込み
			c.mu.Lock()
			err := c.conn.WriteJSON(entry)
			c.mu.Unlock()

			if err != nil {
				logger.Warn("Failed to write to WebSocket", zap.Error(err))
				return
			}
		}
	}
}

// handleLogsClear clears the log buffer
func handleLogsClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	buffer := logger.GetLogBuffer()
	buffer.Clear()

	logger.Info("Log buffer cleared")

	response := map[string]interface{}{
		"success": true,
		"message": "Log buffer cleared",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}