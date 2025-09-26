package twitchtoken

import (
	// 追加
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	
	"github.com/nantokaworks/twitch-overlay/internal/env"
)

var scopes = []string{
	"user:read:chat",
	"user:read:email",
	"channel:read:subscriptions",
	"bits:read",
	"chat:read",
	"chat:edit",
	"moderator:read:followers",
	"channel:manage:redemptions",
	"moderator:manage:shoutouts",
}

func GetTwitchToken(code string) (map[string]interface{}, error) {
	// データベースから読み込まれた認証情報を使用
	clientID := ""
	if env.Value.ClientID != nil {
		clientID = *env.Value.ClientID
	}
	clientSecret := ""
	if env.Value.ClientSecret != nil {
		clientSecret = *env.Value.ClientSecret
	}
	
	// コールバックURLを生成
	redirectURI := getCallbackURL()

	resp, err := http.PostForm("https://id.twitch.tv/oauth2/token", url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"code":          {code},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {redirectURI},
	})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	// レスポンスボディを読み取る
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}
	
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w, body: %s", err, string(body))
	}
	
	// エラーチェック
	if errorMsg, ok := result["error"]; ok {
		return nil, fmt.Errorf("Twitch API error: %v, description: %v", errorMsg, result["error_description"])
	}
	
	if _, ok := result["access_token"]; !ok {
		return nil, fmt.Errorf("access_token not found in response, got: %v", result)
	}
	// スコープの設定（必要に応じて加工）
	result["scope"] = strings.Join(scopes, " ")
	return result, nil
}

// GetOrRefreshToken は有効なトークンを取得するか、無効な場合はリフレッシュを試みます
// 戻り値: (token, isValid, error)
func GetOrRefreshToken() (Token, bool, error) {
	// 最新のトークンを取得
	token, isValid, err := GetLatestToken()
	if err != nil {
		// トークンが存在しない場合
		return Token{}, false, err
	}

	// トークンが有効な場合はそのまま返す
	if isValid {
		return token, true, nil
	}

	// トークンが無効な場合、リフレッシュを試みる
	if token.RefreshToken == "" {
		// リフレッシュトークンがない場合は再認証が必要
		return token, false, nil
	}

	// リフレッシュ実行
	err = token.RefreshTwitchToken()
	if err != nil {
		// リフレッシュに失敗（リフレッシュトークンも無効の可能性）
		return token, false, err
	}

	// リフレッシュ成功後、最新のトークンを取得して返す
	newToken, newIsValid, err := GetLatestToken()
	if err != nil {
		return Token{}, false, err
	}

	return newToken, newIsValid, nil
}

func (t *Token) RefreshTwitchToken() error {
	// データベースから読み込まれた認証情報を使用
	clientID := ""
	if env.Value.ClientID != nil {
		clientID = *env.Value.ClientID
	}
	clientSecret := ""
	if env.Value.ClientSecret != nil {
		clientSecret = *env.Value.ClientSecret
	}

	resp, err := http.PostForm("https://id.twitch.tv/oauth2/token", url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"refresh_token": {t.RefreshToken},
		"grant_type":    {"refresh_token"},
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	var accessToken string
	if v, ok := result["access_token"]; !ok {
		return errors.New("access_token not found in response")
	} else {
		accessToken = v.(string)
	}

	var refreshToken string
	if v, ok := result["refresh_token"]; !ok {
		return errors.New("refresh_token not found in response")
	} else {
		refreshToken = v.(string)
	}

	var scope string
	if v, ok := result["scope"].([]interface{}); !ok {
		return errors.New("scope not found in response")
	} else {
		scopes := make([]string, 0)
		for _, s := range v {
			if str, ok := s.(string); ok {
				scopes = append(scopes, str)
			}
		}
		scope = strings.Join(scopes, " ")
	}
	if _, ok := result["expires_in"]; !ok {
		return errors.New("expires_in not found in response")
	}

	// save token
	t.AccessToken = accessToken
	t.RefreshToken = refreshToken
	t.Scope = scope
	t.ExpiresAt = time.Now().Unix() + int64(result["expires_in"].(float64))
	return t.SaveToken()
}

// getCallbackURL はコールバックURLを生成します
func getCallbackURL() string {
	// 設定されたサーバーポートを使用（デフォルト: 8080）
	port := 8080
	if env.Value.ServerPort != 0 {
		port = env.Value.ServerPort
	}
	return fmt.Sprintf("http://localhost:%d/callback", port)
}

// 変更: 引数なしで環境変数から認証情報を取得し、定数 scopes を使用
func GetAuthURL() string {
	// データベースから読み込まれたClient IDを使用
	clientID := ""
	if env.Value.ClientID != nil {
		clientID = *env.Value.ClientID
	}
	redirectURI := getCallbackURL()
	return fmt.Sprintf(
		"https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=%s&redirect_uri=%s&scope=%s",
		url.QueryEscape(clientID),
		url.QueryEscape(redirectURI),
		url.QueryEscape(strings.Join(scopes, " ")),
	)
}
