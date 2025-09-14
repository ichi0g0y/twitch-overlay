package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/nantokaworks/twitch-overlay/internal/localdb"
	"github.com/nantokaworks/twitch-overlay/internal/music"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"github.com/nantokaworks/twitch-overlay/internal/shared/paths"
	"github.com/nantokaworks/twitch-overlay/internal/webserver"
	"go.uber.org/zap"
)

func main() {
	// ロガーを初期化
	logger.Init(false)
	defer logger.Sync()
	
	logger.Info("Starting test web server...")
	
	// データベースを初期化
	// ~/.twitch-overlay/local.db を使用
	dbPath := paths.GetDBPath()
	logger.Info("Using database path", zap.String("path", dbPath))
	
	// データディレクトリを確保
	if err := paths.EnsureDataDirs(); err != nil {
		logger.Fatal("Failed to ensure data directories", zap.Error(err))
	}
	
	if _, err := localdb.SetupDB(dbPath); err != nil {
		logger.Fatal("Failed to setup database", zap.Error(err))
	}
	
	// 音楽マネージャーを初期化
	if err := music.InitMusicDB(); err != nil {
		logger.Fatal("Failed to initialize music database", zap.Error(err))
	}
	
	// Webサーバーを起動
	port := 8080
	if portStr := os.Getenv("SERVER_PORT"); portStr != "" {
		var p int
		if _, err := fmt.Sscanf(portStr, "%d", &p); err == nil {
			port = p
			logger.Info("Using port from SERVER_PORT env", zap.Int("port", port))
		}
	}
	
	logger.Info("Starting web server", zap.Int("port", port))
	
	// シグナルハンドラーを設定
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	
	// サーバーを別goroutineで起動
	go func() {
		if err := webserver.StartWebServer(port); err != nil {
			log.Fatal("Failed to start web server:", err)
		}
	}()
	
	fmt.Printf("Test server started on port %d\n", port)
	fmt.Println("Press Ctrl+C to stop")
	
	// シグナルを待つ
	<-sigChan
	fmt.Println("\nShutting down...")
}