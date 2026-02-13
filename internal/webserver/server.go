package webserver

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ichi0g0y/twitch-overlay/internal/broadcast"
	"github.com/ichi0g0y/twitch-overlay/internal/env"
	"github.com/ichi0g0y/twitch-overlay/internal/faxmanager"
	"github.com/ichi0g0y/twitch-overlay/internal/fontmanager"
	"github.com/ichi0g0y/twitch-overlay/internal/localdb"
	"github.com/ichi0g0y/twitch-overlay/internal/output"
	"github.com/ichi0g0y/twitch-overlay/internal/settings"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/status"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"github.com/ichi0g0y/twitch-overlay/internal/twitcheventsub"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchtoken"
	twitch "github.com/joeyak/go-twitch-eventsub/v3"
	"go.uber.org/zap"
)

var (
	httpServer *http.Server
	webAssets  *embed.FS // 埋め込みアセット（Wailsビルド時に使用）
)

// webSocketBroadcaster implements the Broadcaster interface using WebSocket
type webSocketBroadcaster struct{}

// BroadcastFax implements FaxBroadcaster interface
func (w *webSocketBroadcaster) BroadcastFax(fax *faxmanager.Fax) {
	BroadcastFax(fax)
}

// BroadcastMessage implements MessageBroadcaster interface
func (w *webSocketBroadcaster) BroadcastMessage(message interface{}) {
	BroadcastMessage(message)
}

// corsMiddleware adds CORS headers to HTTP handlers
func corsMiddleware(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		handler(w, r)
	}
}

// getDebugUserAvatar はデバッグエンドポイント用のアバターURLを取得する
// 常に配信者（toka）のアバターを使用する
func getDebugUserAvatar() (string, error) {
	// 設定からTWITCH_USER_IDを取得
	db := localdb.GetDB()
	if db == nil {
		return "", fmt.Errorf("database not initialized")
	}

	settingsManager := settings.NewSettingsManager(db)
	twitchUserID, err := settingsManager.GetRealValue("TWITCH_USER_ID")
	if err != nil || twitchUserID == "" {
		logger.Warn("Failed to get TWITCH_USER_ID for debug mode",
			zap.Error(err))
		return "", fmt.Errorf("TWITCH_USER_ID not configured")
	}

	logger.Debug("Using broadcaster's avatar for debug endpoint",
		zap.String("broadcaster_id", twitchUserID))

	// 配信者のアバターを取得
	return twitchapi.GetUserAvatar(twitchUserID)
}

// BroadcastMessage sends a message to all connected WebSocket clients
func BroadcastMessage(message interface{}) {
	// messageがmap型の場合、typeフィールドを取得
	if msgMap, ok := message.(map[string]interface{}); ok {
		if msgType, hasType := msgMap["type"].(string); hasType {
			// dataフィールドがある場合はそれを使用
			if data, hasData := msgMap["data"]; hasData {
				BroadcastWSMessage(msgType, data)
			} else {
				// typeフィールドを除いた残りのデータを送信
				cleanData := make(map[string]interface{})
				for k, v := range msgMap {
					if k != "type" {
						cleanData[k] = v
					}
				}
				BroadcastWSMessage(msgType, cleanData)
			}
		}
	}
}

// SetWebAssets sets the embedded web assets for serving
func SetWebAssets(assets *embed.FS) {
	webAssets = assets
}

func StartWebServer(port int) error {
	// Register WebSocket broadcaster
	broadcast.SetBroadcaster(&webSocketBroadcaster{})

	// Register stream status change callback
	status.RegisterStatusChangeCallback(func(streamStatus status.StreamStatus) {
		// WebSocketクライアントに送信
		BroadcastWSMessage("stream_status_changed", streamStatus)
	})

	// Prepare file servers for static files
	// - WebUI:     /          -> frontend/dist
	// - OverlayUI: /overlay/*  -> web/dist
	var overlayServer http.Handler
	var settingsServer http.Handler
	var overlayEmbedded bool
	var settingsEmbedded bool
	var overlayFS fs.FS
	var settingsFS fs.FS
	var overlayDir string
	var settingsDir string
	var settingsDevProxy *httputil.ReverseProxy
	var settingsDevProxyURL string

	if webAssets != nil {
		// Use embedded assets if available (Wails build).
		//
		// NOTE: In wails3 dev, overlay changes (web/dist) will NOT be reflected unless the Go binary is recompiled,
		// because //go:embed snapshots files at build time. For a smoother workflow, prefer serving overlay from
		// the filesystem when a frontend dev server is present (or explicitly requested).
		devPreferFSOverlay := strings.EqualFold(strings.TrimSpace(os.Getenv("DEV_USE_FS_OVERLAY")), "true") ||
			strings.TrimSpace(os.Getenv("FRONTEND_DEVSERVER_URL")) != "" ||
			strings.TrimSpace(os.Getenv("VITE_PORT")) != ""

		logger.Info("Using embedded web assets", zap.Bool("dev_prefer_fs_overlay", devPreferFSOverlay))

		if !devPreferFSOverlay {
			// Overlay assets (required)
			oFS, err := fs.Sub(webAssets, "web/dist")
			if err != nil {
				logger.Error("Failed to get embedded overlay filesystem", zap.Error(err))
				return fmt.Errorf("failed to get embedded overlay filesystem: %w", err)
			}
			overlayFS = oFS
			overlayServer = http.FileServer(http.FS(oFS))
			overlayEmbedded = true
		} else {
			logger.Info("Dev mode: serving overlay from filesystem (./web/dist) instead of embedded assets")
		}

		// Settings assets (optional until embed includes it)
		sFS, err := fs.Sub(webAssets, "frontend/dist")
		if err != nil {
			logger.Warn("Embedded settings assets not found, falling back to filesystem", zap.Error(err))
		} else {
			settingsFS = sFS
			settingsServer = http.FileServer(http.FS(sFS))
			settingsEmbedded = true
		}
	}

	if !overlayEmbedded {
		// Fall back to file system (development / headless mode)
		possiblePaths := []string{}

		// First, try to find public directory relative to executable
		if execPath, err := os.Executable(); err == nil {
			execDir := filepath.Dir(execPath)
			// macOS .app bundle layout: Contents/MacOS (exe) + Contents/Resources (assets)
			possiblePaths = append(possiblePaths, filepath.Join(execDir, "..", "Resources", "web", "dist"))
			possiblePaths = append(possiblePaths, filepath.Join(execDir, "public"))
		}

		// Then try relative paths from current working directory
		possiblePaths = append(possiblePaths,
			"./public",      // Production: same directory as executable
			"./dist/public", // Development: built files
			"./web/dist",    // Fallback: overlay build directory
		)

		for _, path := range possiblePaths {
			if _, err := os.Stat(path); err == nil {
				overlayDir = path
				logger.Info("Using overlay static files directory", zap.String("path", overlayDir))
				break
			}
		}

		if overlayDir == "" {
			logger.Warn("No overlay static files directory found, using default")
			overlayDir = "./web/dist"
		}
		overlayServer = http.FileServer(http.Dir(overlayDir))
	}

	if !settingsEmbedded {
		possiblePaths := []string{}

		// First, try to find frontend/dist relative to executable
		if execPath, err := os.Executable(); err == nil {
			execDir := filepath.Dir(execPath)
			// macOS .app bundle layout: Contents/MacOS (exe) + Contents/Resources (assets)
			possiblePaths = append(possiblePaths, filepath.Join(execDir, "..", "Resources", "frontend", "dist"))
			possiblePaths = append(possiblePaths, filepath.Join(execDir, "frontend", "dist"))
		}

		// Then try relative paths from current working directory
		possiblePaths = append(possiblePaths,
			"./frontend/dist",
			"./dist/frontend",
		)

		for _, path := range possiblePaths {
			if _, err := os.Stat(path); err == nil {
				settingsDir = path
				logger.Info("Using settings static files directory", zap.String("path", settingsDir))
				break
			}
		}

		if settingsDir == "" {
			logger.Warn("No settings static files directory found, using default")
			settingsDir = "./frontend/dist"
		}
		settingsServer = http.FileServer(http.Dir(settingsDir))
	}

	// Dev: proxy WebUI (/) to Vite so Chrome can see live changes without rebuilding dist.
	// Wails dev usually provides FRONTEND_DEVSERVER_URL like http://localhost:9245.
	{
		settingsDevProxyURL = strings.TrimSpace(os.Getenv("FRONTEND_DEVSERVER_URL"))
		if settingsDevProxyURL == "" {
			if vitePort := strings.TrimSpace(os.Getenv("VITE_PORT")); vitePort != "" {
				settingsDevProxyURL = fmt.Sprintf("http://127.0.0.1:%s", vitePort)
			}
		}

		if settingsDevProxyURL != "" {
			u, err := url.Parse(settingsDevProxyURL)
			if err != nil || u.Scheme == "" || u.Host == "" {
				logger.Warn("Invalid FRONTEND_DEVSERVER_URL, ignoring", zap.String("url", settingsDevProxyURL), zap.Error(err))
				settingsDevProxyURL = ""
			} else {
				// Quick reachability check to avoid masking the static UI when Vite is down.
				client := &http.Client{Timeout: 300 * time.Millisecond}
				req, _ := http.NewRequest(http.MethodGet, strings.TrimRight(settingsDevProxyURL, "/")+"/@vite/client", nil)
				resp, err := client.Do(req)
				if err != nil {
					logger.Warn("Frontend dev server not reachable, falling back to static dist", zap.String("url", settingsDevProxyURL), zap.Error(err))
					settingsDevProxyURL = ""
				} else {
					_ = resp.Body.Close()
					settingsDevProxy = httputil.NewSingleHostReverseProxy(u)
					origDirector := settingsDevProxy.Director
					settingsDevProxy.Director = func(r *http.Request) {
						origDirector(r)
						// Ensure Host matches upstream for websockets/HMR.
						r.Host = u.Host
					}
					logger.Info("Proxying WebUI to frontend dev server", zap.String("url", settingsDevProxyURL))
				}
			}
		}
	}

	// Create a new ServeMux for better routing control
	mux := http.NewServeMux()

	// Music API endpoints
	RegisterMusicRoutes(mux)
	RegisterMusicControlRoutes(mux)
	RegisterPlaybackRoutes(mux)
	RegisterOverlaySettingsRoutes(mux)

	// Present Lottery endpoints
	RegisterPresentRoutes(mux)

	// Settings API endpoints - 最初に登録してAPIが優先されるようにする
	mux.HandleFunc("/api/settings/v2", corsMiddleware(handleSettingsV2))
		mux.HandleFunc("/api/settings/status", corsMiddleware(handleSettingsStatus))
		mux.HandleFunc("/api/settings/bulk", corsMiddleware(handleBulkSettings))
		mux.HandleFunc("/api/settings/font/preview", corsMiddleware(handleFontPreview))
		mux.HandleFunc("/api/settings/font/file", corsMiddleware(handleFontFile))
		mux.HandleFunc("/api/settings/font", handleFontUpload) // handleFontUploadは独自のCORS処理を持つ
		mux.HandleFunc("/api/settings/auth/status", corsMiddleware(handleAuthStatus))
		mux.HandleFunc("/api/settings", corsMiddleware(handleSettings))

	// Printer API endpoints
	mux.HandleFunc("/api/printer/scan", corsMiddleware(handlePrinterScan))
	mux.HandleFunc("/api/printer/test", corsMiddleware(handlePrinterTest))
	mux.HandleFunc("/api/printer/test-print", corsMiddleware(handlePrinterTestPrint))
	mux.HandleFunc("/api/printer/status", corsMiddleware(handlePrinterStatus))
	mux.HandleFunc("/api/printer/reconnect", corsMiddleware(handlePrinterReconnect))
	mux.HandleFunc("/api/printer/system-printers", corsMiddleware(handleSystemPrinters))
	mux.HandleFunc("/api/debug/printer-status", corsMiddleware(handleDebugPrinterStatus)) // デバッグ用

	// Cache API endpoints
	mux.HandleFunc("/api/cache/settings", corsMiddleware(handleCacheSettings))
	mux.HandleFunc("/api/cache/stats", corsMiddleware(handleCacheStats))
	mux.HandleFunc("/api/cache/clear", corsMiddleware(handleCacheClear))
	mux.HandleFunc("/api/cache/cleanup", corsMiddleware(handleCacheCleanup))

	// Logs API endpoints
	mux.HandleFunc("/api/logs", corsMiddleware(handleLogs))
	mux.HandleFunc("/api/logs/download", corsMiddleware(handleLogsDownload))
	mux.HandleFunc("/api/logs/stream", handleLogsStream) // WebSocketは独自のUpgrade処理
	mux.HandleFunc("/api/logs/clear", corsMiddleware(handleLogsClear))
	mux.HandleFunc("/api/chat/history", corsMiddleware(handleChatHistory))

	// WebSocket endpoint (新しい統合エンドポイント)
	RegisterWebSocketRoute(mux)

	// Fax image endpoint
	mux.HandleFunc("/fax/", handleFaxImage)

	// Status endpoint
	mux.HandleFunc("/status", handleStatus)

	// Debug endpoints
	mux.HandleFunc("/debug/fax", handleDebugFax)
	mux.HandleFunc("/debug/channel-points", handleDebugChannelPoints)
	mux.HandleFunc("/debug/clock", handleDebugClock)
	mux.HandleFunc("/debug/follow", handleDebugFollow)
	mux.HandleFunc("/debug/cheer", handleDebugCheer)
	mux.HandleFunc("/debug/subscribe", handleDebugSubscribe)
	mux.HandleFunc("/debug/gift-sub", handleDebugGiftSub)
	mux.HandleFunc("/debug/resub", handleDebugResub)
	mux.HandleFunc("/debug/raid", handleDebugRaid)
	mux.HandleFunc("/debug/shoutout", handleDebugShoutout)
	mux.HandleFunc("/debug/stream-online", handleDebugStreamOnline)
	mux.HandleFunc("/debug/stream-offline", handleDebugStreamOffline)

	// OAuth endpoints
	mux.HandleFunc("/auth", handleAuth)
	mux.HandleFunc("/callback", handleCallback)

	// Twitch API endpoints
	mux.HandleFunc("/api/twitch/verify", corsMiddleware(handleTwitchVerify))
	mux.HandleFunc("/api/twitch/refresh-token", corsMiddleware(handleTwitchRefreshToken))
	mux.HandleFunc("/api/twitch/custom-rewards/create", corsMiddleware(handleCreateCustomReward))
	mux.HandleFunc("/api/twitch/custom-rewards/", corsMiddleware(handleTwitchCustomRewards))
	mux.HandleFunc("/api/twitch/custom-rewards", corsMiddleware(handleTwitchCustomRewards))
	mux.HandleFunc("/api/stream/status", corsMiddleware(handleStreamStatus))

	// Word Filter API endpoints
	mux.HandleFunc("/api/word-filter", corsMiddleware(handleWordFilter))
	mux.HandleFunc("/api/word-filter/", corsMiddleware(handleWordFilterByPath))

	// Reward Groups API endpoints
	mux.HandleFunc("/api/twitch/reward-groups", corsMiddleware(handleRewardGroups))
	mux.HandleFunc("/api/twitch/reward-groups/by-reward", corsMiddleware(handleGetRewardGroupsByRewardID))
	mux.HandleFunc("/api/twitch/reward-groups/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Route based on path
		if strings.HasSuffix(r.URL.Path, "/toggle") {
			handleToggleRewardGroup(w, r)
		} else if strings.Contains(r.URL.Path, "/counts") {
			// Handle group-specific reward counts
			handleGetGroupRewardCounts(w, r)
		} else if strings.Contains(r.URL.Path, "/rewards/") {
			handleRewardGroupMembers(w, r)
		} else if strings.Contains(r.URL.Path, "/rewards") {
			handleRewardGroupMembers(w, r)
		} else {
			handleRewardGroupByID(w, r)
		}
	}))

	// Reward Counts API endpoints
	mux.HandleFunc("/api/twitch/reward-counts", corsMiddleware(handleGetAllRewardCounts))
	mux.HandleFunc("/api/twitch/reward-counts/reset", corsMiddleware(handleResetAllRewardCounts))
	mux.HandleFunc("/api/twitch/reward-counts/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		logger.Info("reward-counts handler called", zap.String("path", r.URL.Path), zap.String("method", r.Method))

		// Handle user removal: DELETE /api/twitch/reward-counts/{reward_id}/users/{index}
		if r.Method == http.MethodDelete && strings.Contains(r.URL.Path, "/users/") {
			logger.Info("Matched /users/ path with DELETE method, calling handleRemoveUserFromRewardCount")
			handleRemoveUserFromRewardCount(w, r)
			return
		}

		// Handle individual reward count reset
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/reset") {
			logger.Info("Matched /reset suffix with POST method, calling handleResetRewardCount")
			handleResetRewardCount(w, r)
			return
		}
		// リクエストパスが不正な場合
		logger.Warn("No handler matched for path", zap.String("path", r.URL.Path), zap.String("method", r.Method))
		http.Error(w, "Not found", http.StatusNotFound)
	}))
	mux.HandleFunc("/api/twitch/rewards/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Handle display name updates
		if strings.HasSuffix(r.URL.Path, "/display-name") {
			handleSetRewardDisplayName(w, r)
			return
		}
		// リクエストパスが不正な場合
		http.Error(w, "Not found", http.StatusNotFound)
	}))

	// Legacy routes: redirect old overlay paths to /overlay/*
	mux.HandleFunc("/overlay", func(w http.ResponseWriter, r *http.Request) {
		target := "/overlay/"
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		http.Redirect(w, r, target, http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("/present", func(w http.ResponseWriter, r *http.Request) {
		target := "/overlay/present"
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		http.Redirect(w, r, target, http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("/present/", func(w http.ResponseWriter, r *http.Request) {
		target := "/overlay/present"
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		http.Redirect(w, r, target, http.StatusTemporaryRedirect)
	})

	// Overlay UI (SPA) - /overlay/*
	mux.HandleFunc("/overlay/", func(w http.ResponseWriter, r *http.Request) {
		// StripPrefix("/overlay") so FileServer sees "/assets/..." etc.
		strippedHandler := http.StripPrefix("/overlay", overlayServer)

		if overlayEmbedded {
			rel := strings.TrimPrefix(r.URL.Path, "/overlay")
			rel = strings.TrimPrefix(rel, "/")
			if rel == "" {
				rel = "index.html"
			}

			if file, err := overlayFS.Open(rel); err == nil {
				file.Close()
				strippedHandler.ServeHTTP(w, r)
				return
			}

			// SPA fallback
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			if indexFile, err := overlayFS.Open("index.html"); err == nil {
				defer indexFile.Close()
				if data, err := io.ReadAll(indexFile); err == nil {
					w.Write(data)
				}
			}
			return
		}

		// File system mode
		rel := strings.TrimPrefix(r.URL.Path, "/overlay/")
		rel = strings.TrimPrefix(rel, "/")
		if rel != "" && !strings.HasSuffix(r.URL.Path, "/") {
			filePath := filepath.Join(overlayDir, rel)
			if stat, err := os.Stat(filePath); err == nil && !stat.IsDir() {
				strippedHandler.ServeHTTP(w, r)
				return
			}
		}

		http.ServeFile(w, r, filepath.Join(overlayDir, "index.html"))
	})

	// WebUI (SPA) - / (最後に登録)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if settingsDevProxy != nil {
			settingsDevProxy.ServeHTTP(w, r)
			return
		}

		if settingsEmbedded {
			rel := strings.TrimPrefix(r.URL.Path, "/")
			if rel == "" {
				rel = "index.html"
			}

			if file, err := settingsFS.Open(rel); err == nil {
				file.Close()
				settingsServer.ServeHTTP(w, r)
				return
			}

			// SPA fallback
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			if indexFile, err := settingsFS.Open("index.html"); err == nil {
				defer indexFile.Close()
				if data, err := io.ReadAll(indexFile); err == nil {
					w.Write(data)
				}
			}
			return
		}

		rel := strings.TrimPrefix(r.URL.Path, "/")
		if rel != "" && !strings.HasSuffix(r.URL.Path, "/") {
			filePath := filepath.Join(settingsDir, rel)
			if stat, err := os.Stat(filePath); err == nil && !stat.IsDir() {
				settingsServer.ServeHTTP(w, r)
				return
			}
		}

		http.ServeFile(w, r, filepath.Join(settingsDir, "index.html"))
	})

	addr := fmt.Sprintf(":%d", port)

	// 起動メッセージを表示（logger出力の前に）
	fmt.Println("")
	fmt.Println("====================================================")
	fmt.Printf("🚀 Webサーバーが起動しました\n")
	fmt.Printf("📡 アクセスURL:\n")
	fmt.Printf("   WebUI:      http://localhost:%d/\n", port)
	fmt.Printf("   オーバーレイ: http://localhost:%d/overlay/\n", port)
	fmt.Printf("\n")
	fmt.Printf("🔧 環境変数 SERVER_PORT で変更可能\n")
	fmt.Println("====================================================")
	fmt.Println("")

	logger.Info("Starting web server", zap.String("address", addr))

	// Create HTTP server instance
	httpServer = &http.Server{
		Addr:         addr,
		Handler:      mux,              // Use our custom ServeMux
		WriteTimeout: 30 * time.Second, // SSE用に書き込みタイムアウトを設定
		ReadTimeout:  10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start server in goroutine and wait briefly to check for immediate errors
	errChan := make(chan error, 1)
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errChan <- err
		}
		close(errChan)
	}()

	// Wait briefly to catch immediate binding errors
	select {
	case err := <-errChan:
		if err != nil {
			logger.Error("Failed to start web server", zap.Error(err))
			return fmt.Errorf("failed to start web server on port %d: %w", port, err)
		}
	case <-time.After(100 * time.Millisecond):
		// Server started successfully
	}

	return nil
}

// Shutdown gracefully shuts down the web server
func Shutdown() {
	if httpServer == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		logger.Error("Failed to shutdown web server gracefully", zap.Error(err))
	} else {
		logger.Info("Web server shutdown complete")
	}
}

// handleFaxImage serves fax images
func handleFaxImage(w http.ResponseWriter, r *http.Request) {
	// Parse URL: /fax/{id}/{type}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/fax/"), "/")
	if len(parts) != 2 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	id := parts[0]
	imageType := parts[1]

	// Get image path from fax manager
	imagePath, err := faxmanager.GetImagePath(id, imageType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// Check if file exists
	if _, err := os.Stat(imagePath); os.IsNotExist(err) {
		http.Error(w, "Image not found", http.StatusNotFound)
		return
	}

	// Set content type
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=600") // Cache for 10 minutes

	// Serve the file
	http.ServeFile(w, r, imagePath)
}

// BroadcastFax sends a fax notification to all connected WebSocket clients
func BroadcastFax(fax *faxmanager.Fax) {
	msg := map[string]interface{}{
		"type":        "fax",
		"id":          fax.ID,
		"timestamp":   fax.Timestamp.Unix() * 1000, // JavaScriptのミリ秒に変換
		"username":    fax.UserName,
		"displayName": fax.UserName, // 表示名も同じにする
		"message":     fax.Message,
		"imageUrl":    fmt.Sprintf("/fax/%s/color", fax.ID), // カラー画像のURLを生成
	}

	// WebSocketクライアントに送信
	BroadcastWSMessage("fax", msg)

	logger.Info("Broadcasted fax to clients",
		zap.String("id", fax.ID))
}

// handleStatus returns the current system status
func handleStatus(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	statusData := map[string]interface{}{
		"printerConnected": status.IsPrinterConnected(),
		"timestamp":        time.Now().Format("2006-01-02T15:04:05Z"),
	}

	jsonData, err := json.Marshal(statusData)
	if err != nil {
		http.Error(w, "Failed to marshal status", http.StatusInternalServerError)
		return
	}

	w.Write(jsonData)
}

// DebugFaxRequest represents a debug fax request
type DebugFaxRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Message     string `json:"message"`
	ImageURL    string `json:"imageUrl,omitempty"`
}

// handleDebugFax handles debug fax submissions
func handleDebugFax(w http.ResponseWriter, r *http.Request) {
	// Note: This endpoint is kept for backwards compatibility
	// but the frontend now uses local mode by default
	// Only allow in debug mode
	if os.Getenv("DEBUG_MODE") != "true" {
		http.Error(w, "Debug mode not enabled", http.StatusForbidden)
		return
	}

	// Only accept POST
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req DebugFaxRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Username == "" || req.Message == "" {
		http.Error(w, "Username and message are required", http.StatusBadRequest)
		return
	}

	// If displayName is empty, use username
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}

	// Create message fragments
	fragments := []twitch.ChatMessageFragment{
		{
			Type: "text",
			Text: req.Message,
		},
	}

	// Process the fax
	logger.Info("Processing debug fax",
		zap.String("username", req.Username),
		zap.String("message", req.Message),
		zap.String("imageUrl", req.ImageURL))

	// Get avatar for debug mode
	avatarURL, err := getDebugUserAvatar()
	if err != nil {
		logger.Warn("Failed to get debug user avatar", zap.Error(err))
		avatarURL = "" // Continue without avatar
	}

	// Call PrintOut directly (same as custom reward handling)
	err = output.PrintOut(req.Username, fragments, avatarURL, time.Now())
	if err != nil {
		logger.Error("Failed to process debug fax", zap.Error(err))
		http.Error(w, "Failed to process fax", http.StatusInternalServerError)
		return
	}

	// Return success
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Debug fax queued successfully",
	})
}

// DebugChannelPointsRequest represents a debug channel points request
type DebugChannelPointsRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	RewardTitle string `json:"rewardTitle"`
	UserInput   string `json:"userInput"`
}

// handleDebugChannelPoints handles debug channel points redemption
func handleDebugChannelPoints(w http.ResponseWriter, r *http.Request) {
	// CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle OPTIONS
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Only accept POST
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req DebugChannelPointsRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Username == "" || req.UserInput == "" {
		http.Error(w, "Username and userInput are required", http.StatusBadRequest)
		return
	}

	// If displayName is empty, use username
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}

	// Create message fragments - exactly like HandleChannelPointsCustomRedemptionAdd
	fragments := []twitch.ChatMessageFragment{
		{
			Type: "text",
			Text: req.UserInput,
		},
	}

	// Process the fax - exactly like HandleChannelPointsCustomRedemptionAdd
	logger.Info("Processing debug channel points redemption",
		zap.String("username", req.Username),
		zap.String("userInput", req.UserInput))

	// Get avatar for debug mode
	avatarURL, err := getDebugUserAvatar()
	if err != nil {
		logger.Warn("Failed to get debug user avatar", zap.Error(err))
		avatarURL = "" // Continue without avatar
	}

	// Call PrintOut directly (same as channel points handling)
	err = output.PrintOut(req.Username, fragments, avatarURL, time.Now())
	if err != nil {
		logger.Error("Failed to process debug channel points", zap.Error(err))
		http.Error(w, "Failed to process channel points redemption", http.StatusInternalServerError)
		return
	}

	// Return success
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Debug channel points redemption processed successfully",
	})
}

// DebugClockRequest represents a debug clock print request
type DebugClockRequest struct {
	WithStats        bool `json:"withStats"`
	EmptyLeaderboard bool `json:"emptyLeaderboard"`
}

// handleDebugClock handles debug clock print requests
func handleDebugClock(w http.ResponseWriter, r *http.Request) {
	// CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle OPTIONS
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Only accept POST
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req DebugClockRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Get current time
	now := time.Now()
	timeStr := now.Format("15:04")

	logger.Info("Processing debug clock print",
		zap.String("time", timeStr),
		zap.Bool("withStats", req.WithStats),
		zap.Bool("emptyLeaderboard", req.EmptyLeaderboard))

	// Call PrintClock with options based on request
	err = output.PrintClockWithOptions(timeStr, req.EmptyLeaderboard)
	if err != nil {
		logger.Error("Failed to print debug clock",
			zap.Error(err),
			zap.String("time", timeStr),
			zap.Bool("emptyLeaderboard", req.EmptyLeaderboard))
		// Return more detailed error message
		errorMsg := fmt.Sprintf("Failed to print clock: %v", err)
		http.Error(w, errorMsg, http.StatusInternalServerError)
		return
	}

	// Return success
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": fmt.Sprintf("Clock printed at %s with leaderboard stats", timeStr),
		"time":    timeStr,
	})
}

// handleDebugFollow handles debug follow event
func handleDebugFollow(w http.ResponseWriter, r *http.Request) {
	// CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		req.Username = "DebugUser"
	}

	// Call the same handler as real follow events
	twitcheventsub.HandleChannelFollow(twitch.EventChannelFollow{
		User: twitch.User{
			UserID:    "debug-" + req.Username,
			UserLogin: strings.ToLower(req.Username),
			UserName:  req.Username,
		},
		FollowedAt: time.Now(),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleDebugCheer handles debug cheer event
func handleDebugCheer(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Bits     int    `json:"bits"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		req.Username = "DebugUser"
	}
	if req.Bits == 0 {
		req.Bits = 100
	}

	twitcheventsub.HandleChannelCheer(twitch.EventChannelCheer{
		User: twitch.User{
			UserID:    "debug-" + req.Username,
			UserLogin: strings.ToLower(req.Username),
			UserName:  req.Username,
		},
		Bits: req.Bits,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleDebugSubscribe handles debug subscribe event
func handleDebugSubscribe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		req.Username = "DebugUser"
	}

	twitcheventsub.HandleChannelSubscribe(twitch.EventChannelSubscribe{
		User: twitch.User{
			UserID:    "debug-" + req.Username,
			UserLogin: strings.ToLower(req.Username),
			UserName:  req.Username,
		},
		Tier:   "1000",
		IsGift: false,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleDebugGiftSub handles debug gift sub event
func handleDebugGiftSub(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username    string `json:"username"`
		IsAnonymous bool   `json:"isAnonymous"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		req.Username = "DebugUser"
	}

	twitcheventsub.HandleChannelSubscriptionGift(twitch.EventChannelSubscriptionGift{
		User: twitch.User{
			UserID:    "debug-" + req.Username,
			UserLogin: strings.ToLower(req.Username),
			UserName:  req.Username,
		},
		Total:       1,
		Tier:        "1000",
		IsAnonymous: req.IsAnonymous,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleDebugResub handles debug resub event
func handleDebugResub(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username         string `json:"username"`
		CumulativeMonths int    `json:"cumulativeMonths"`
		Message          string `json:"message"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		req.Username = "DebugUser"
	}
	if req.CumulativeMonths == 0 {
		req.CumulativeMonths = 3
	}
	if req.Message == "" {
		req.Message = "デバッグ再サブスクメッセージ"
	}

	twitcheventsub.HandleChannelSubscriptionMessage(twitch.EventChannelSubscriptionMessage{
		User: twitch.User{
			UserID:    "debug-" + req.Username,
			UserLogin: strings.ToLower(req.Username),
			UserName:  req.Username,
		},
		Tier:             "1000",
		Message:          twitch.Message{Text: req.Message},
		CumulativeMonths: req.CumulativeMonths,
		StreakMonths:     req.CumulativeMonths,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleDebugRaid handles debug raid event
func handleDebugRaid(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		FromBroadcaster string `json:"fromBroadcaster"`
		Viewers         int    `json:"viewers"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.FromBroadcaster == "" {
		req.FromBroadcaster = "DebugRaider"
	}
	if req.Viewers == 0 {
		req.Viewers = 10
	}

	twitcheventsub.HandleChannelRaid(twitch.EventChannelRaid{
		FromBroadcaster: twitch.FromBroadcaster{
			FromBroadcasterUserId:    "debug-" + req.FromBroadcaster,
			FromBroadcasterUserLogin: strings.ToLower(req.FromBroadcaster),
			FromBroadcasterUserName:  req.FromBroadcaster,
		},
		Viewers: req.Viewers,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleDebugShoutout handles debug shoutout event
func handleDebugShoutout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		FromBroadcaster string `json:"fromBroadcaster"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.FromBroadcaster == "" {
		req.FromBroadcaster = "DebugShouter"
	}

	twitcheventsub.HandleChannelShoutoutReceive(twitch.EventChannelShoutoutReceive{
		FromBroadcaster: twitch.FromBroadcaster{
			FromBroadcasterUserId:    "debug-" + req.FromBroadcaster,
			FromBroadcasterUserLogin: strings.ToLower(req.FromBroadcaster),
			FromBroadcasterUserName:  req.FromBroadcaster,
		},
		ViewerCount: 100,
		StartedAt:   time.Now(),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleDebugStreamOnline handles debug stream online event
func handleDebugStreamOnline(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	twitcheventsub.HandleStreamOnline(twitch.EventStreamOnline{
		Broadcaster: twitch.Broadcaster{
			BroadcasterUserId:    "debug-broadcaster",
			BroadcasterUserLogin: "debugbroadcaster",
			BroadcasterUserName:  "DebugBroadcaster",
		},
		Id:        "debug-stream-" + time.Now().Format("20060102150405"),
		Type:      "live",
		StartedAt: time.Now(),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleDebugStreamOffline handles debug stream offline event
func handleDebugStreamOffline(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	twitcheventsub.HandleStreamOffline(twitch.EventStreamOffline{
		BroadcasterUserId:    "debug-broadcaster",
		BroadcasterUserLogin: "debugbroadcaster",
		BroadcasterUserName:  "DebugBroadcaster",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleAuth handles OAuth authentication redirect
func handleAuth(w http.ResponseWriter, r *http.Request) {
	authURL := twitchtoken.GetAuthURL()
	http.Redirect(w, r, authURL, http.StatusFound)
}

// handleCallback handles OAuth callback
func handleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "code not found", http.StatusBadRequest)
		return
	}

	// Get token from Twitch
	result, err := twitchtoken.GetTwitchToken(code)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Process expires_in
	expiresInFloat, ok := result["expires_in"].(float64)
	if !ok {
		http.Error(w, "invalid expires_in", http.StatusInternalServerError)
		return
	}
	expiresAtNew := time.Now().Unix() + int64(expiresInFloat)
	newToken := twitchtoken.Token{
		AccessToken:  result["access_token"].(string),
		RefreshToken: result["refresh_token"].(string),
		Scope:        result["scope"].(string),
		ExpiresAt:    expiresAtNew,
	}
	if err := newToken.SaveToken(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Success message
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `
<!DOCTYPE html>
<html>
<head>
    <title>認証成功 - Twitch FAX</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #0e0e10;
            color: #efeff1;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background-color: #18181b;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #9147ff;
            margin-bottom: 1rem;
        }
        p {
            margin-bottom: 1.5rem;
        }
        a {
            color: #9147ff;
            text-decoration: none;
            padding: 0.5rem 1rem;
            border: 2px solid #9147ff;
            border-radius: 4px;
            transition: all 0.2s;
        }
        a:hover {
            background-color: #9147ff;
            color: #ffffff;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎉 認証成功！</h1>
        <p>Twitchアカウントの連携が完了しました。</p>
        <p>このウィンドウを閉じて、アプリケーションに戻ってください。</p>
        <a href="/">ホームに戻る</a>
    </div>
</body>
</html>
`)
}

// handleSettings returns current settings
func handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	settings := map[string]interface{}{
		"font": fontmanager.GetCurrentFontInfo(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

// handleFontUpload handles font file upload
func handleFontUpload(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers first
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle OPTIONS request
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case http.MethodPost:
		// Parse multipart form
		err := r.ParseMultipartForm(fontmanager.MaxFileSize)
		if err != nil {
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}

		// Get the file
		file, header, err := r.FormFile("font")
		if err != nil {
			http.Error(w, "Failed to get file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Save the font
		err = fontmanager.SaveCustomFont(header.Filename, file, header.Size)
		if err != nil {
			logger.Error("Failed to save font", zap.Error(err))

			// Return appropriate error message
			switch err {
			case fontmanager.ErrFileTooLarge:
				http.Error(w, "File too large (max 50MB)", http.StatusRequestEntityTooLarge)
			case fontmanager.ErrInvalidFormat:
				http.Error(w, "Invalid font format (only TTF/OTF supported)", http.StatusBadRequest)
			default:
				http.Error(w, "Failed to save font", http.StatusInternalServerError)
			}
			return
		}

		// Persist FONT_FILENAME to settings DB (keeps WebUI consistent with legacy Wails UI)
		if db := localdb.GetDB(); db != nil {
			settingsManager := settings.NewSettingsManager(db)
			if err := settingsManager.SetSetting("FONT_FILENAME", header.Filename); err != nil {
				logger.Warn("Failed to save FONT_FILENAME setting", zap.Error(err))
			} else if err := env.ReloadFromDatabase(); err != nil {
				logger.Warn("Failed to reload env values from database after font upload", zap.Error(err))
			}
		} else {
			logger.Warn("Database not initialized, FONT_FILENAME setting not saved")
		}

		// Return success with updated font info
		// Notify connected clients (overlay/webui) to refresh font-face if needed.
		BroadcastWSMessage("font_updated", fontmanager.GetCurrentFontInfo())

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"font":    fontmanager.GetCurrentFontInfo(),
		})

	case http.MethodDelete:
		// Delete custom font
		err := fontmanager.DeleteCustomFont()
		if err != nil {
			if err == fontmanager.ErrNoCustomFont {
				http.Error(w, "No custom font configured", http.StatusNotFound)
			} else {
				http.Error(w, "Failed to delete font", http.StatusInternalServerError)
			}
			return
		}

		// Persist FONT_FILENAME clearing to settings DB
		if db := localdb.GetDB(); db != nil {
			settingsManager := settings.NewSettingsManager(db)
			if err := settingsManager.SetSetting("FONT_FILENAME", ""); err != nil {
				logger.Warn("Failed to clear FONT_FILENAME setting", zap.Error(err))
			} else if err := env.ReloadFromDatabase(); err != nil {
				logger.Warn("Failed to reload env values from database after font delete", zap.Error(err))
			}
		} else {
			logger.Warn("Database not initialized, FONT_FILENAME setting not cleared")
		}

		// Return success
		// Notify connected clients (overlay/webui) to refresh font-face if needed.
		BroadcastWSMessage("font_updated", fontmanager.GetCurrentFontInfo())

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Custom font deleted successfully",
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleFontPreview generates a preview image with the current font
func handleFontPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse JSON body
	var req struct {
		Text string `json:"text"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Text == "" {
		req.Text = "サンプルテキスト Sample Text 123"
	}

	// Generate preview image
	fragments := []twitch.ChatMessageFragment{
		{Type: "text", Text: req.Text},
	}

	// Use output package to generate image
	img, err := output.GeneratePreviewImage("プレビュー", fragments)
	if err != nil {
		logger.Error("Failed to generate preview", zap.Error(err))
		http.Error(w, "Failed to generate preview", http.StatusInternalServerError)
		return
	}

	// Return base64 encoded image
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"image": img,
	})
}

// handleAuthStatus returns current Twitch authentication status
func handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get current token status (try refresh if expired)
	token, isValid, err := twitchtoken.GetOrRefreshToken()

	response := map[string]interface{}{
		"authUrl":       twitchtoken.GetAuthURL(),
		"authenticated": false,
		"expiresAt":     nil,
		"error":         nil,
	}

	if err != nil {
		// No token found or refresh failed
		response["error"] = "No token found"
	} else {
		response["authenticated"] = isValid
		response["expiresAt"] = token.ExpiresAt
		if !isValid {
			// Refresh failed, need re-authentication
			response["error"] = "Token expired and refresh failed"
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleStreamStatus は現在の配信状態を返すエンドポイント
func handleStreamStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	streamStatus := status.GetStreamStatus()

	// 追加情報を取得（視聴者数など）
	var viewerCount int
	if streamStatus.IsLive {
		if streamInfo, err := twitchapi.GetStreamInfo(); err == nil && streamInfo.IsLive {
			viewerCount = streamInfo.ViewerCount
			status.UpdateViewerCount(viewerCount)
		}
	}

	response := map[string]interface{}{
		"is_live":      streamStatus.IsLive,
		"started_at":   streamStatus.StartedAt,
		"viewer_count": viewerCount,
		"last_checked": streamStatus.LastChecked,
	}

	if streamStatus.IsLive && streamStatus.StartedAt != nil {
		duration := time.Since(*streamStatus.StartedAt)
		response["duration_seconds"] = int(duration.Seconds())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleTwitchRefreshToken は手動でトークンをリフレッシュするエンドポイント
func handleTwitchRefreshToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 現在のトークンを取得
	token, _, err := twitchtoken.GetLatestToken()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "No token found",
		})
		return
	}

	// リフレッシュトークンが存在しない場合はエラー
	if token.RefreshToken == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "No refresh token available",
		})
		return
	}

	// トークンをリフレッシュ
	if err := token.RefreshTwitchToken(); err != nil {
		logger.Error("Failed to refresh token manually", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Failed to refresh token: %v", err),
		})
		return
	}

	// リフレッシュ成功後、新しいトークン情報を取得
	newToken, isValid, _ := twitchtoken.GetLatestToken()

	logger.Info("Token refreshed manually via API")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"authenticated": isValid,
		"expiresAt":     newToken.ExpiresAt,
		"message":       "Token refreshed successfully",
	})
}
