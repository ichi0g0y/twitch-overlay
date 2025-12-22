package webserver

import (
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// handleRemoteControl リモートコントロールUIを配信
func handleRemoteControl(w http.ResponseWriter, r *http.Request) {
	logger.Info("handleRemoteControl called", zap.String("path", r.URL.Path))
	if webAssets != nil {
		// 本番: 埋め込みアセットから配信
		remoteFS, err := fs.Sub(webAssets, "web/dist/remote")
		if err != nil {
			logger.Error("Failed to get remote UI filesystem", zap.Error(err))
			http.Error(w, "Remote UI not found", http.StatusNotFound)
			return
		}

		// パスを調整（/remoteまたは/remote/を削除）
		path := strings.TrimPrefix(r.URL.Path, "/remote")
		path = strings.TrimPrefix(path, "/")
		if path == "" {
			path = "index.html"
		}

		// ファイルの存在確認
		if file, err := remoteFS.Open(path); err == nil {
			file.Close()
			// ファイルが存在する場合、http.FileServerで配信
			// パスを調整してファイルサーバーに渡す
			strippedHandler := http.StripPrefix("/remote", http.FileServer(http.FS(remoteFS)))
			strippedHandler.ServeHTTP(w, r)
		} else {
			// ファイルが存在しない場合、SPAフォールバックでindex.htmlを返す
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			if indexFile, err := remoteFS.Open("index.html"); err == nil {
				defer indexFile.Close()
				if data, err := io.ReadAll(indexFile); err == nil {
					w.Write(data)
				}
			} else {
				logger.Error("Failed to open index.html", zap.Error(err))
				http.Error(w, "Remote UI not found", http.StatusNotFound)
			}
		}
	} else {
		// 開発: ファイルシステムから配信
		path := strings.TrimPrefix(r.URL.Path, "/remote")
		path = strings.TrimPrefix(path, "/")

		filePath := filepath.Join("./web/dist/remote", path)

		// ファイルの存在確認
		if _, err := os.Stat(filePath); err == nil {
			// ファイルが存在する場合、http.FileServerで配信
			strippedHandler := http.StripPrefix("/remote", http.FileServer(http.Dir("./web/dist/remote")))
			strippedHandler.ServeHTTP(w, r)
		} else {
			// ファイルが存在しない場合、SPAフォールバックでindex.htmlを返す
			indexPath := filepath.Join("./web/dist/remote", "index.html")
			http.ServeFile(w, r, indexPath)
		}
	}
}
