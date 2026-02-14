# issue-task-h-notification TASK H: 通知システム

- 状態: Open
- 優先度: 中
- 担当: 未定
- 期限: 未定

## 概要

旧 `docs/TASK_H_NOTIFICATION.md` から移植した未完了タスクを、このIssue本文で追跡する。

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

## レビュー観点

- 移植元TASK文書の具体項目が漏れず反映されているか
- 受け入れ条件が検証可能な粒度になっているか
- 1Issue 1PRで進められる分割になっているか

## TODO ID連携

- なし

## 関連ファイル

- `issues/open/issue-task-h-notification/README.md`
- `issues/index.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
