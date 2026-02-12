# TASK G: Present/Overlay整合

- 優先度: **P1**
- 見積: 1日
- 依存: Phase C（EventSubのチャンネルポイント連携）
- ブロック: Phase K（初期化統合: 抽選参加者DB読み込み）

---

## 目的

Go版 `present_handler.go` (968行) + `localdb/lottery_participants.go` (286行) のプレゼント抽選機能を、Tauri側で互換APIとして復元する。現在 `/api/present/*` パスがTauri側で `/api/lottery*` に変更されており、フロントエンドと互換性がない。

---

## タスク

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
