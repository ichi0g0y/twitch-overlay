# TASK H: 通知システム

> 運用メモ: 進行中タスクの正本は `issues/` へ移行しました。
> 移行先Issue: `issues/open/ISSUE-0010-issue-task-h-notification/README.md`


- 優先度: **P2**
- 見積: 2-3日
- 依存: Phase C（EventSubイベント受信）
- ブロック: Phase K（初期化統合: 通知システム初期化）

---

## 目的

Go版 `notification/notification.go` (850行) のデスクトップ通知システムをTauri側に移植する。マルチウィンドウ、キュー処理、フラグメント対応を含む。

---

## タスク

### H-1. 通知キュー基盤

**新規作成**: `src-tauri/src/notification/mod.rs`, `src-tauri/src/notification/queue.rs`

```rust
struct ChatNotification {
    username: String,
    message: String,
    fragments: Vec<FragmentInfo>,  // テキスト/Emoji/Emote混合
    avatar_url: Option<String>,
    color: Option<String>,         // ユーザーカラー
    display_mode: DisplayMode,     // Queue / Overwrite
}

enum DisplayMode {
    Queue,      // 順次表示（前の通知完了後に次を表示）
    Overwrite,  // 即時上書き（現在の通知を即座に置換）
}

enum FragmentInfo {
    Text(String),
    Emoji(String),
    Emote { id: String, url: String },
}
```

- `tokio::sync::mpsc` (バッファ100) でキューイング
- ワーカータスクが順次処理

**参考**: `internal/notification/notification.go:1-100` 構造体・初期化

### H-2. 通知ウィンドウ管理

**新規作成**: `src-tauri/src/notification/window.rs`

- `tauri::WebviewWindow` で通知ウィンドウを動的生成
- ウィンドウ属性:
  - 透明背景
  - 装飾なし（タイトルバーなし）
  - 常に最前面
  - フォーカスを奪わない
  - リサイズ不可
- ウィンドウサイズは通知内容に応じて動的計算

**参考**: `internal/notification/notification.go:100-250`

### H-3. ウィンドウ位置管理

**変更対象**: `src-tauri/src/notification/window.rs`

- 通知ウィンドウの位置をDB永続化
- スクリーンインデックスを保存（マルチモニター対応）
- Tauri `Monitor` API で利用可能なスクリーン情報取得
- 初回起動時はプライマリモニターの右下に配置
- ウィンドウ移動時に新しい位置をDBに保存
- 位置リセット機能（デフォルト位置に戻す）

**参考**: `internal/notification/notification.go:250-400`

### H-4. 表示モード実装

**変更対象**: `src-tauri/src/notification/queue.rs`

**Queue モード**:
1. 通知キューからデキュー
2. 通知ウィンドウを表示
3. 表示時間（設定値）経過を待機
4. ウィンドウを非表示
5. 次の通知をデキュー

**Overwrite モード**:
1. 新しい通知が来たら即座にウィンドウ内容を更新
2. 表示タイマーをリセット
3. タイマー満了でウィンドウを非表示

設定キー: `NOTIFICATION_DISPLAY_MODE` (`queue` | `overwrite`)

**参考**: `internal/notification/notification.go:400-550`

### H-5. フラグメントレンダリング

**変更対象**: `src-tauri/src/notification/` 内

通知ウィンドウのフロントエンド（HTML/CSS/JS）:
- テキストフラグメント: 通常テキスト描画
- Emoji: システムEmoji描画
- Emote: Twitch Emote画像をインライン表示
- フォントサイズ: 設定値に従う
- アバター: ユーザーアバター画像を表示

通知用HTMLテンプレートを `src-tauri/src/notification/` 内に配置。

**参考**: `internal/notification/notification.go:550-700`

### H-6. WebSocket連携

**変更対象**: `src-tauri/src/notification/`, `src-tauri/src/server/websocket.rs`

- EventSubイベント受信時に通知キューに投入
- 対象イベント:
  - `ChannelCheer` → Bits通知
  - `ChannelFollow` → フォロー通知
  - `ChannelRaid` → レイド通知
  - `ChannelSubscribe` → サブスク通知
  - `ChannelSubscriptionGift` → ギフトサブ通知
  - `ChannelSubscriptionMessage` → リサブ通知
  - `ChannelShoutoutReceive` → シャウトアウト通知
- WebSocket `broadcastChatNotification` でオーバーレイにも送信

**参考**: `internal/notification/notification.go:700-850`

### H-7. 初期化と設定

**変更対象**: `src-tauri/src/notification/mod.rs`

初期化時:
1. DBから通知ウィンドウ位置を読み込み
2. スクリーン情報プロバイダーを登録（Tauri Monitor API）
3. 通知キューワーカータスクを起動
4. 設定変更リスナーを登録（表示モード/フォントサイズ等の動的変更）

設定キー:
- `NOTIFICATION_ENABLED` — 通知の有効/無効
- `NOTIFICATION_DISPLAY_MODE` — queue / overwrite
- `NOTIFICATION_FONT_SIZE` — フォントサイズ
- `NOTIFICATION_DURATION` — 表示時間（秒）
- `NOTIFICATION_SCREEN_INDEX` — 表示スクリーン
- `NOTIFICATION_POSITION_X` / `_Y` — ウィンドウ位置

---

## 完了条件

- [ ] 通知キューが正常に動作（投入→順次表示→非表示）
- [ ] Queue/Overwrite 両モードが期待通りに動作
- [ ] マルチウィンドウ通知が表示される
- [ ] 通知ウィンドウの位置がDB永続化・復元される
- [ ] フラグメント（テキスト/Emoji/Emote）が正しく描画される
- [ ] EventSubイベントが通知として表示される
- [ ] 設定変更が動的に反映される

---

## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `internal/notification/notification.go` | 850 | 通知システム全体 |
| `internal/notification/types.go` | - | ChatNotification, FragmentInfo 型定義 |
| `app.go:800-900` | - | notification.Initialize() 呼び出し |
| `window_darwin.go` | - | GetNotificationWindowPosition / Move CGO関数 |
