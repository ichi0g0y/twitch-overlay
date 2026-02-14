# issue-task-g-present-overlay TASK G: Present/Overlay整合

- 状態: Open
- 優先度: 中
- 担当: 未定
- 期限: 未定

## 概要

旧 `docs/TASK_G_PRESENT_OVERLAY.md` から移植した未完了タスクを、このIssue本文で追跡する。

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

### G-1. エンドポイント互換復元

**変更対象**: `src-tauri/src/server/api/present.rs` (既存を修正)

Go版の9エンドポイントとパス/ペイロードを一致させる:

| Method | Path | 用途 |
|--------|------|------|
| POST | `/api/present/test` | テスト抽選実行 |
| GET | `/api/present/participants` | 参加者一覧取得 |
| POST | `/api/present/participants` | 参加者追加 |
| DELETE | `/api/present/participants/{id}` | 参加者削除 |
| POST | `/api/present/start` | 抽選開始 |
| POST | `/api/present/stop` | 抽選停止 |
| POST | `/api/present/clear` | 参加者全クリア |
| POST | `/api/present/lock` | 参加受付ロック |
| POST | `/api/present/unlock` | 参加受付アンロック |

内部では既存の lottery 実装を呼び出すアダプター層を作る。

**参考**: `internal/webserver/present_handler.go:1-100` ルート定義

### G-2. 抽選ロジック復元

**変更対象**: `src-tauri/src/server/api/present.rs`

1. **参加者追加**: 重複チェック（同一ユーザーIDで弾く）
2. **ランダム抽選**: `start` 時に参加者リストからランダム選出
3. **タイマー制御**: 抽選演出のタイマー管理（設定 `PRESENT_DURATION` 秒）
4. **自動抽選**: EventSub `ChannelPointsCustomRewardRedemptionAdd` 連携

**参考**: `internal/webserver/present_handler.go:100-500`

### G-3. Twitchチャンネルポイント連携

**変更対象**: `src-tauri/src/server/api/present.rs`

- `lock`: Twitch `UpdateCustomRewardEnabled(false)` でリワードを無効化
- `unlock`: Twitch `UpdateCustomRewardEnabled(true)` でリワードを有効化
- 設定 `PRESENT_REWARD_ID` で対象リワードIDを指定
- Twitch APIエラー時はログ出力のみ（抽選自体は続行）

**参考**: `internal/webserver/present_handler.go:500-700`

### G-4. サブスクライバーステータス

**変更対象**: `src-tauri/src/server/api/present.rs`

**`POST /api/present/refresh-subscribers`**:
- 参加者リスト内の全ユーザーのサブスクライバーステータスを更新
- Twitch API `GET /subscriptions` で確認
- 結果をDBに反映

**参考**: `internal/webserver/present_handler.go:700-800`

### G-5. チャットカラー取得

**変更対象**: `src-tauri/src/server/api/present.rs`

- 参加者追加時に `GetUserChatColors()` でTwitch APIからカラー取得
- 取得失敗時はフォールバックカラーパレット（10色）を使用:
  ```
  #FF0000, #0000FF, #008000, #B22222, #FF7F50,
  #9ACD32, #FF4500, #2E8B57, #DAA520, #D2691E
  ```
- カラー情報はDB永続化

**参考**: `internal/webserver/present_handler.go:800-900`

### G-6. WebSocketリアルタイム抽選演出

**変更対象**: `src-tauri/src/server/websocket.rs`, `src-tauri/src/server/api/present.rs`

- 抽選開始時: `present_started` をWebSocketブロードキャスト
- 当選者決定時: `present_winner` をWebSocketブロードキャスト
- 抽選停止時: `present_stopped` をWebSocketブロードキャスト
- `/overlay/present` ページがWebSocketで受信して演出表示

**参考**: `internal/webserver/present_handler.go:900-968`

### G-7. 動作確認

- `/overlay/present` ページでの抽選演出表示確認
- フロントエンド設定画面からの抽選操作確認
- Twitchリワードのロック/アンロック連携確認

---


## 完了条件

- [ ] 9つのAPIエンドポイントがGo版と同じパス・レスポンスで動作
- [ ] 参加者の追加・削除・一覧・クリアが正常動作
- [ ] ランダム抽選が実行され当選者が決定される
- [ ] Twitchチャンネルポイントのロック/アンロックが連携
- [ ] WebSocket経由でリアルタイム抽選演出が動作
- [ ] `/overlay/present` ページで演出が表示される
- [ ] サブスクライバーステータスの一括更新が動作

---


## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `internal/webserver/present_handler.go` | 968 | 抽選全機能（API + ロジック + WS演出） |
| `internal/localdb/lottery_participants.go` | 286 | 抽選参加者DB管理 |
| `internal/twitchapi/rewards.go` | - | リワード有効/無効制御 |
| `internal/twitchapi/users.go` | - | チャットカラー取得 |

## レビュー観点

- 移植元TASK文書の具体項目が漏れず反映されているか
- 受け入れ条件が検証可能な粒度になっているか
- 1Issue 1PRで進められる分割になっているか

## TODO ID連携

- なし

## 関連ファイル

- `issues/open/issue-task-g-present-overlay/README.md`
- `issues/index.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
