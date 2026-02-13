# TASK B: OAuth / Twitch復旧

- 優先度: **P0**
- 見積: 1-2日
- 依存: Phase A
- ブロック: Phase C, K

---

## 目的

Twitch OAuth認証フロー、トークン管理、配信ステータス取得をTauri側で実装し、設定画面からTwitch連携操作を可能にする。

---

## タスク

### B-1. OAuth認証エンドポイント

**変更対象**: `src-tauri/src/server/api/auth.rs` (新規 or 既存)

**`GET /auth`**:
- Twitch OAuth認証URLを生成しリダイレクト
- スコープ: `user:read:chat channel:read:subscriptions bits:read channel:read:redemptions moderator:read:followers channel:manage:redemptions`
- コールバックURL: `http://localhost:30303/callback`
- state パラメータでCSRF防止

**`GET /callback`**:
- 認証コードを受け取りトークン交換
- `https://id.twitch.tv/oauth2/token` へPOST
- access_token, refresh_token をDB保存 (`overlay-db/tokens`)
- 成功時にフロントエンドへリダイレクト or `auth_success` emit

**参考**: `internal/webserver/server.go` のOAuth処理、`internal/twitchtoken/token.go`

### B-2. トークンリフレッシュ実装

**変更対象**: `src-tauri/src/server/api/twitch.rs`, `crates/twitch-client/src/auth.rs`

**`GET /api/twitch/refresh-token`**:
- DBからrefresh_tokenを取得
- `https://id.twitch.tv/oauth2/token` へrefresh grant POSTy
- 新しいaccess_token, refresh_tokenをDB更新
- エラー時は401を返し再認証を促す

**参考**: `internal/twitchtoken/token.go` のリフレッシュロジック

### B-3. 配信ステータス実装

**変更対象**: `src-tauri/src/server/api/twitch.rs`

**`GET /api/stream/status`**:
- Twitch Helix API `GET https://api.twitch.tv/helix/streams?user_id={id}` を呼び出し
- `data` が空なら offline、存在すれば online
- レスポンス: `{"isLive": bool, "title": "...", "viewerCount": N, "startedAt": "..."}`

**参考**: `internal/twitchapi/stream.go`

### B-4. Custom Rewards CRUD復旧

**変更対象**: `src-tauri/src/server/api/twitch.rs`

既存のスタブを実処理に置換:
- `GET /api/twitch/custom-rewards` — Helix `GET /channel_points/custom_rewards`
- `POST /api/twitch/custom-rewards` — Helix `POST /channel_points/custom_rewards`
- `PUT /api/twitch/custom-rewards/{id}` — Helix `PATCH /channel_points/custom_rewards`
- `DELETE /api/twitch/custom-rewards/{id}` — Helix `DELETE /channel_points/custom_rewards`

401応答時は自動でトークンリフレッシュ→リトライ。

**参考**: `internal/twitchapi/rewards.go`

### B-5. トークン自動リフレッシュタスク

**変更対象**: `src-tauri/src/app.rs` 初期化部分

tokioタスクで30分間隔のトークン有効性チェック:
- 有効期限30分前でリフレッシュ実行
- 失敗時は指数バックオフでリトライ
- ログ出力 (tracing)

**参考**: `internal/twitchtoken/refresh.go` のgoroutine

---

## 完了条件

- [ ] ブラウザで `/auth` にアクセスするとTwitch認証画面にリダイレクト
- [ ] 認証後 `/callback` でトークンがDBに保存される
- [ ] `/api/twitch/refresh-token` でトークン更新が成功
- [ ] `/api/stream/status` が実際の配信状態を返す
- [ ] Custom Rewards の CRUD が全て動作
- [ ] トークン自動リフレッシュが30分間隔で実行

---

## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `internal/twitchtoken/token.go` | - | トークン取得・保存・リフレッシュ |
| `internal/twitchapi/stream.go` | - | 配信ステータス取得 |
| `internal/twitchapi/rewards.go` | - | Custom Rewards CRUD |
| `internal/webserver/server.go:300-310` | - | /auth, /callback ルート登録 |
| `app.go:1380-1400` | - | OAuth コールバック処理 |
