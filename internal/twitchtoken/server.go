package twitchtoken

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

var (
	callbackServer *http.Server
	serverOnce     sync.Once
)

func SetupCallbackServer() {
	serverOnce.Do(func() {
		setupCallbackServerInternal()
	})
}

func setupCallbackServerInternal() {
	// 独自のServeMuxを作成
	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// ルートパスへのアクセスは404を返す（認証ページへのリダイレクトを削除）
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})

	// コールバックハンドラ
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		// エラーパラメータをチェック
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			errDesc := r.URL.Query().Get("error_description")
			logger.Error("OAuth error", zap.String("error", errParam), zap.String("description", errDesc))
			
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			errorHTML := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>認証エラー</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #ef4444 0%%, #dc2626 100%%);
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
        }
        h1 { color: #ef4444; margin-bottom: 20px; }
        p { color: #6b7280; margin-bottom: 10px; }
        .error-detail { 
            background: #fef2f2; 
            padding: 10px; 
            border-radius: 5px; 
            color: #991b1b;
            font-size: 14px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>❌ 認証エラー</h1>
        <p>Twitch認証中にエラーが発生しました。</p>
        <div class="error-detail">%s: %s</div>
    </div>
</body>
</html>
`, errParam, errDesc)
			w.Write([]byte(errorHTML))
			return
		}
		
		code := r.URL.Query().Get("code")
		if code == "" {
			http.Error(w, "code not found", http.StatusBadRequest)
			return
		}
		// Twitchからトークン取得
		result, err := GetTwitchToken(code)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// expires_inの処理
		expiresInFloat, ok := result["expires_in"].(float64)
		if !ok {
			http.Error(w, "invalid expires_in", http.StatusInternalServerError)
			return
		}
		expiresAtNew := time.Now().Unix() + int64(expiresInFloat)
		newToken := Token{
			AccessToken:  result["access_token"].(string),
			RefreshToken: result["refresh_token"].(string),
			Scope:        result["scope"].(string),
			ExpiresAt:    expiresAtNew,
		}
		if err := newToken.SaveToken(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// 成功ページを表示
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		successHTML := `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>認証成功</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
        }
        h1 {
            color: #10b981;
            margin-bottom: 20px;
        }
        p {
            color: #6b7280;
            margin-bottom: 20px;
        }
        .close-hint {
            font-size: 14px;
            color: #9ca3af;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>✅ 認証成功！</h1>
        <p>Twitchアカウントとの連携が完了しました。</p>
        <p class="close-hint">このウィンドウは閉じていただいて構いません。</p>
    </div>
    <script>
        // 3秒後に自動的にウィンドウを閉じる
        setTimeout(() => {
            window.close();
        }, 3000);
    </script>
</body>
</html>
`
		w.Write([]byte(successHTML))
	})

	logger.Info("Starting OAuth callback server on port 30303")

	// Create server instance
	callbackServer = &http.Server{
		Addr:    ":30303",
		Handler: mux,
	}

	go func() {
		if err := callbackServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Failed to start OAuth callback server", zap.Error(err))
			return
		}
	}()

	// Wait briefly to check if server started successfully
	time.Sleep(100 * time.Millisecond)
	
	// Test if the server is actually listening
	resp, err := http.Get("http://localhost:30303/health")
	if err == nil {
		resp.Body.Close()
		logger.Info("OAuth callback server started successfully")
	}
}
