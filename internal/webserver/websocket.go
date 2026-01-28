package webserver

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/settings"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/translation"
	"go.uber.org/zap"
)

// WSMessage はWebSocketメッセージの構造を定義
type WSMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// WSClient はWebSocket接続クライアントを表す
type WSClient struct {
	conn        *websocket.Conn
	send        chan wsOutboundMessage
	clientID    string
	connectedAt time.Time
}

type wsOutboundMessage struct {
	messageType int
	data        []byte
}

type micTranscriptPayload struct {
	Type       string `json:"type"`
	ID         string `json:"id"`
	Text       string `json:"text"`
	IsInterim  bool   `json:"is_interim"`
	Timestamp  int64  `json:"timestamp_ms"`
	Source     string `json:"source"`
	Language   string `json:"language"`
	Model      string `json:"model"`
	SampleRate int    `json:"sample_rate"`
}

// WSHub はすべてのWebSocket接続を管理
type WSHub struct {
	clients    map[*WSClient]bool
	register   chan *WSClient
	unregister chan *WSClient
	broadcast  chan WSMessage
	mu         sync.RWMutex
}

// WSRetryQueue は送信失敗したメッセージを保存するキュー
type WSRetryQueue struct {
	messages []WSMessage
	mu       sync.Mutex
}

func getMicTranscriptTranslationConfig() (bool, string) {
	overlaySettingsMutex.RLock()
	settingsSnapshot := currentOverlaySettings
	overlaySettingsMutex.RUnlock()

	if settingsSnapshot == nil {
		return false, ""
	}
	if !settingsSnapshot.MicTranscriptEnabled || !settingsSnapshot.MicTranscriptTranslationEnabled {
		return false, ""
	}
	targetLang := strings.TrimSpace(settingsSnapshot.MicTranscriptTranslationLanguage)
	if targetLang == "" {
		return false, ""
	}
	return true, targetLang
}

func translateMicTranscript(payload micTranscriptPayload, targetLang string) {
	if strings.TrimSpace(payload.Text) == "" || strings.TrimSpace(payload.ID) == "" {
		return
	}

	db := localdb.GetDB()
	if db == nil {
		logger.Warn("Mic transcript translation skipped: database not initialized")
		return
	}

	settingsManager := settings.NewSettingsManager(db)
	apiKey, err := settingsManager.GetRealValue("OPENAI_API_KEY")
	if err != nil || strings.TrimSpace(apiKey) == "" {
		return
	}

	modelName, _ := settingsManager.GetRealValue("OPENAI_MODEL")
	translated, sourceLang, err := translation.TranslateToTargetLanguage(apiKey, payload.Text, modelName, targetLang)
	if err != nil {
		logger.Warn("Failed to translate mic transcript", zap.Error(err))
		return
	}

	if strings.TrimSpace(translated) == "" {
		return
	}

	BroadcastWSMessage("mic_transcript_translation", map[string]interface{}{
		"id":              payload.ID,
		"translation":     translated,
		"target_language": targetLang,
		"source_language": sourceLang,
	})
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
	broadcast:  make(chan WSMessage, 2048), // 256 → 2048に拡大（リワード大量発生時のドロップ防止）
}

var wsRetryQueue = &WSRetryQueue{
	messages: []WSMessage{},
}

// StartWSHub WebSocketハブを起動
func StartWSHub() {
	go wsHub.run()
	go retryFailedMessages()
	logger.Info("WebSocket hub and retry worker started")
}

// retryFailedMessages は送信失敗したメッセージの再送を試みる
func retryFailedMessages() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		wsRetryQueue.mu.Lock()
		if len(wsRetryQueue.messages) > 0 {
			msg := wsRetryQueue.messages[0]
			select {
			case wsHub.broadcast <- msg:
				// 送信成功：キューから削除
				wsRetryQueue.messages = wsRetryQueue.messages[1:]
				logger.Debug("Retry message sent successfully",
					zap.String("type", msg.Type),
					zap.Int("remaining", len(wsRetryQueue.messages)))
			default:
				// まだフル：次回再試行
			}
		}
		wsRetryQueue.mu.Unlock()
	}
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
				case client.send <- wsOutboundMessage{messageType: websocket.TextMessage, data: data}:
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
				logger.Error("Failed to marshal WebSocket message",
					zap.Error(err),
					zap.String("messageType", message.Type),
					zap.Int("dataLength", len(message.Data)),
					zap.String("dataPreview", string(message.Data[:min(100, len(message.Data))])))
				continue
			}

			// デバッグログ：実際に送信されるJSONデータ
			logger.Debug("Sending WebSocket message to clients",
				zap.String("jsonData", string(data[:min(200, len(data))])))

			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- wsOutboundMessage{messageType: websocket.TextMessage, data: data}:
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
				select {
				case client.send <- wsOutboundMessage{messageType: websocket.PingMessage, data: nil}:
				default:
					// クライアントのバッファがフルの場合は切断
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
	// dataをjson.RawMessageに変換
	var jsonData json.RawMessage

	// dataが既にbyte配列やjson.RawMessageの場合はそのまま使用
	switch v := data.(type) {
	case json.RawMessage:
		jsonData = v
	case []byte:
		jsonData = json.RawMessage(v)
	default:
		// それ以外の場合はMarshal
		marshaledData, err := json.Marshal(data)
		if err != nil {
			logger.Error("Failed to marshal WebSocket broadcast data",
				zap.Error(err),
				zap.String("msgType", msgType),
				zap.Any("data", data))
			return
		}
		jsonData = json.RawMessage(marshaledData)
	}

	msg := WSMessage{
		Type: msgType,
		Data: jsonData,
	}

	// デバッグログ：送信するメッセージの内容を確認
	logger.Info("Broadcasting WebSocket message",
		zap.String("type", msgType),
		zap.Int("dataSize", len(jsonData)),
		zap.String("dataPreview", string(jsonData[:min(100, len(jsonData))])))

	// リトライ付き送信（最大3回、10msバックオフ）
	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		select {
		case wsHub.broadcast <- msg:
			logger.Debug("WebSocket message sent", zap.String("type", msgType))
			return
		default:
			if i < maxRetries-1 {
				logger.Warn("WebSocket broadcast channel full, retrying...",
					zap.Int("attempt", i+1))
				time.Sleep(10 * time.Millisecond)
			} else {
				// リトライ失敗：リトライキューに追加
				wsRetryQueue.mu.Lock()
				wsRetryQueue.messages = append(wsRetryQueue.messages, msg)
				queueSize := len(wsRetryQueue.messages)
				wsRetryQueue.mu.Unlock()

				logger.Warn("WebSocket broadcast failed after retries, added to retry queue",
					zap.String("type", msgType),
					zap.Int("maxRetries", maxRetries),
					zap.Int("retryQueueSize", queueSize))
			}
		}
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
		send:        make(chan wsOutboundMessage, 256),
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

	c.conn.SetReadDeadline(time.Now().Add(120 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(120 * time.Second))
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

		// JSON形式のpingメッセージを認識してReadDeadlineを延長
		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err == nil {
			if msg.Type == "ping" {
				c.conn.SetReadDeadline(time.Now().Add(120 * time.Second))
				logger.Debug("Received ping from client, extended read deadline",
					zap.String("clientId", c.clientID))

				// pongレスポンスを返送
				pongMsg := WSMessage{
					Type: "pong",
					Data: json.RawMessage(`{}`),
				}
				if data, err := json.Marshal(pongMsg); err == nil {
					select {
					case c.send <- wsOutboundMessage{messageType: websocket.TextMessage, data: data}:
					default:
						logger.Debug("Failed to send pong: send buffer full",
							zap.String("clientId", c.clientID))
					}
				}
				continue
			}
		}

		var transcript micTranscriptPayload
		if err := json.Unmarshal(message, &transcript); err == nil {
			if transcript.Type == "transcript" {
				BroadcastWSMessage("mic_transcript", json.RawMessage(message))
				if !transcript.IsInterim {
					if enabled, targetLang := getMicTranscriptTranslationConfig(); enabled {
						go translateMicTranscript(transcript, targetLang)
					}
				}
				continue
			}
		}

		// その他のクライアントからのメッセージを処理
		logger.Debug("Received WebSocket message from client",
			zap.String("clientId", c.clientID),
			zap.String("message", string(message)))
	}
}

func (c *WSClient) writePump() {
	defer func() {
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

			if err := c.conn.WriteMessage(message.messageType, message.data); err != nil {
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
