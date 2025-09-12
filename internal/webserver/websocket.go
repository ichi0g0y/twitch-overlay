package webserver

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// WSMessage はWebSocketメッセージの構造を定義
type WSMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// WSClient はWebSocket接続クライアントを表す
type WSClient struct {
	conn       *websocket.Conn
	send       chan []byte
	clientID   string
	connectedAt time.Time
}

// WSHub はすべてのWebSocket接続を管理
type WSHub struct {
	clients    map[*WSClient]bool
	register   chan *WSClient
	unregister chan *WSClient
	broadcast  chan WSMessage
	mu         sync.RWMutex
}

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// 開発環境では全てのオリジンを許可
		// TODO: 本番環境では適切なオリジンチェックを実装
		return true
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

var wsHub = &WSHub{
	clients:    make(map[*WSClient]bool),
	register:   make(chan *WSClient),
	unregister: make(chan *WSClient),
	broadcast:  make(chan WSMessage, 256),
}

// StartWSHub WebSocketハブを起動
func StartWSHub() {
	go wsHub.run()
}

func (h *WSHub) run() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			
			logger.Info("WebSocket client connected",
				zap.String("clientId", client.clientID),
				zap.Int("total_clients", len(h.clients)))

			// 接続確認メッセージを送信
			connMsg := WSMessage{
				Type: "connected",
				Data: json.RawMessage(`{"clientId":"` + client.clientID + `"}`),
			}
			if data, err := json.Marshal(connMsg); err == nil {
				select {
				case client.send <- data:
				default:
					// バッファがフルの場合はスキップ
				}
			}

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				h.mu.Unlock()
				
				logger.Info("WebSocket client disconnected",
					zap.String("clientId", client.clientID),
					zap.Int("remaining_clients", len(h.clients)))
			} else {
				h.mu.Unlock()
			}

		case message := <-h.broadcast:
			data, err := json.Marshal(message)
			if err != nil {
				logger.Error("Failed to marshal WebSocket message", zap.Error(err))
				continue
			}

			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- data:
				default:
					// クライアントのバッファがフルの場合は切断
					go func(c *WSClient) {
						h.unregister <- c
						c.conn.Close()
					}(client)
				}
			}
			h.mu.RUnlock()

		case <-ticker.C:
			// ハートビート送信
			h.mu.RLock()
			for client := range h.clients {
				if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					go func(c *WSClient) {
						h.unregister <- c
						c.conn.Close()
					}(client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastWSMessage すべてのクライアントにメッセージを送信
func BroadcastWSMessage(msgType string, data interface{}) {
	// music_statusは頻繁すぎるのでログをスキップ
	if msgType != "music_status" {
		logger.Info("BroadcastWSMessage called",
			zap.String("message_type", msgType),
			zap.Any("data", data))
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		logger.Error("Failed to marshal WebSocket broadcast data", zap.Error(err))
		return
	}

	msg := WSMessage{
		Type: msgType,
		Data: jsonData,
	}

	select {
	case wsHub.broadcast <- msg:
		// music_statusは頻繁すぎるのでログをスキップ
		if msgType != "music_status" {
			logger.Info("WebSocket message queued for broadcast",
				zap.String("message_type", msgType))
		}
	default:
		logger.Warn("WebSocket broadcast channel full, message dropped")
	}
}

// handleWS WebSocket接続を処理
func handleWS(w http.ResponseWriter, r *http.Request) {
	// クライアントIDを取得または生成
	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		clientID = generateClientID()
	}

	// WebSocketにアップグレード
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("Failed to upgrade to WebSocket", zap.Error(err))
		return
	}

	client := &WSClient{
		conn:        conn,
		send:        make(chan []byte, 256),
		clientID:    clientID,
		connectedAt: time.Now(),
	}

	wsHub.register <- client

	// ゴルーチンでクライアントの読み書きを処理
	go client.writePump()
	go client.readPump()
}

func (c *WSClient) readPump() {
	defer func() {
		wsHub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Debug("WebSocket read error", zap.Error(err))
			}
			break
		}

		// クライアントからのメッセージを処理（必要に応じて実装）
		logger.Debug("Received WebSocket message from client",
			zap.String("clientId", c.clientID),
			zap.String("message", string(message)))
	}
}

func (c *WSClient) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			c.conn.WriteMessage(websocket.TextMessage, message)

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// generateClientID クライアントIDを生成
func generateClientID() string {
	return fmt.Sprintf("ws-%d-%d", time.Now().UnixNano(), rand.Int63())
}

// RegisterWebSocketRoute WebSocketルートを登録
func RegisterWebSocketRoute(mux *http.ServeMux) {
	mux.HandleFunc("/ws", handleWS)
	
	// WebSocketハブを起動
	StartWSHub()
}