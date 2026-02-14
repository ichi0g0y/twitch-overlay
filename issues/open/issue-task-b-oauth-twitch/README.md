# issue-task-b-oauth-twitch TASK B: OAuth / Twitch復旧

- 状態: Open
- 優先度: 高
- 担当: 未定
- 期限: 未定

## 概要

旧 `docs/TASK_B_OAUTH_TWITCH.md` から移植した未完了タスクを、このIssue本文で追跡する。

## 背景

`issues/` をタスク管理の正本とする運用に合わせ、削除済み旧TASK文書の実装計画をIssueへ移し替える必要がある。

## 目的

移植元の具体タスク・完了条件を本Issueで完結管理し、1Issue 1PRで実装を進められる状態にする。

## 作業前に守る制約

- 手順書・計画・レビュー観点の正本を `issues/` に統一する
- レビュー指摘対応時は `issues/in-progress/` と `issues/review-waiting/` の状態遷移ルールに従う

## 実施手順

1. `## タスク分解` の項目を上から順に実装する
2. 実装・検証ごとにチェックボックスを更新する
3. 完了時に `issues/index.md` とIssue状態を更新する

## スコープ

- このテーマの実装タスクと受け入れ条件
- 移植元TASK文書に含まれていたレビュー観点・参照情報

## 非スコープ

- 他Issue領域の同時改修
- 実装と無関係な仕様改定

## タスク分解

### 移植元タスク詳細

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

## レビュー観点

- 移植元TASK文書の具体項目が漏れず反映されているか
- 受け入れ条件が検証可能な粒度になっているか
- 1Issue 1PRで進められる分割になっているか

## TODO ID連携

- なし

## 関連ファイル

- `issues/open/issue-task-b-oauth-twitch/README.md`
- `issues/index.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
