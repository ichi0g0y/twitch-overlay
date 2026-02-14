# issue-task-c-eventsub TASK C: EventSub実装

- 状態: Open
- 優先度: 中
- 担当: 未定
- 期限: 未定

## 概要

旧 `docs/TASK_C_EVENTSUB.md` から移植した未完了タスクを、このIssue本文で追跡する。

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

### C-1. EventSub WebSocket接続

**変更対象**: `crates/twitch-client/src/eventsub.rs`

- `wss://eventsub.wss.twitch.tv/ws` に tokio-tungstenite で接続
- `session_welcome` メッセージから `session_id` を取得
- `session_keepalive` で接続監視（30秒間隔）
- `session_reconnect` で再接続URL切替

**参考**: `internal/twitcheventsub/sub.go:1-100`

### C-2. イベント購読登録

**変更対象**: `crates/twitch-client/src/eventsub.rs`

Helix API `POST /eventsub/subscriptions` で11種を登録:

| # | type | version | condition |
|---|------|---------|-----------|
| 1 | channel.channel_points_custom_reward_redemption.add | 1 | broadcaster_user_id |
| 2 | channel.cheer | 1 | broadcaster_user_id |
| 3 | channel.follow | 2 | broadcaster_user_id + moderator_user_id |
| 4 | channel.raid | 1 | to_broadcaster_user_id |
| 5 | channel.chat.message | 1 | broadcaster_user_id + user_id |
| 6 | channel.shoutout.receive | 1 | broadcaster_user_id + moderator_user_id |
| 7 | channel.subscribe | 1 | broadcaster_user_id |
| 8 | channel.subscription.gift | 1 | broadcaster_user_id |
| 9 | channel.subscription.message | 1 | broadcaster_user_id |
| 10 | stream.offline | 1 | broadcaster_user_id |
| 11 | stream.online | 1 | broadcaster_user_id |

transport: `{"method": "websocket", "session_id": "..."}`

**参考**: `internal/twitcheventsub/sub.go:100-250`

### C-3. イベントハンドラー実装

**変更対象**: `crates/twitch-client/src/eventsub.rs` + `src-tauri/src/` 内のハンドラー

各イベントの処理:

1. **ChannelPointsCustomRewardRedemptionAdd**: リワードキューに追加 → printout処理
2. **ChannelCheer**: Bits金額・メッセージ → printout/通知
3. **ChannelFollow**: フォロー通知 → printout/通知
4. **ChannelRaid**: レイド情報 → printout/通知
5. **ChannelChatMessage**: チャットメッセージ → DB保存 + WS broadcast
6. **ChannelShoutoutReceive**: SO受信 → 通知
7. **ChannelSubscribe**: サブスク → printout/通知
8. **ChannelSubscriptionGift**: ギフトサブ → printout/通知
9. **ChannelSubscriptionMessage**: リサブ → printout/通知
10. **StreamOffline**: 配信終了 → ステータス更新 + WS broadcast
11. **StreamOnline**: 配信開始 → ステータス更新 + WS broadcast

全イベントを `eventsub_event` としてWebSocketブロードキャスト。

**参考**:
- `internal/twitcheventsub/channel.go` (708行)
- `internal/twitcheventsub/stream.go` (80行)

### C-4. リワードキュー

**変更対象**: `src-tauri/src/` 内

- tokio mpsc (バッファ1000) でリワード redemption をキューイング
- ワーカータスクが順次処理
- 重複チェック（同一redemption IDの二重処理防止）

**参考**: `internal/twitcheventsub/channel.go:291-400`

### C-5. 接続監視・再接続

- keepalive タイムアウト検知 → 自動再接続
- ネットワーク断 → 指数バックオフで再接続
- 再接続時に購読を再登録

---


## 完了条件

- [ ] EventSub WebSocket接続が確立される
- [ ] 11種のイベント購読が登録される
- [ ] チャットメッセージが受信されDBに保存される
- [ ] 配信開始/終了で `stream_status_changed` がWS broadcast
- [ ] チャンネルポイント使用がリワードキューに入る
- [ ] keepalive タイムアウト時に自動再接続

---


## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `internal/twitcheventsub/sub.go` | 468 | 接続・購読・メッセージルーティング |
| `internal/twitcheventsub/channel.go` | ~700 | チャンネルイベント9種ハンドラー |
| `internal/twitcheventsub/stream.go` | ~80 | 配信開始/終了ハンドラー |
| `internal/twitcheventsub/types.go` | - | イベントペイロード型定義 |

## レビュー観点

- 移植元TASK文書の具体項目が漏れず反映されているか
- 受け入れ条件が検証可能な粒度になっているか
- 1Issue 1PRで進められる分割になっているか

## TODO ID連携

- なし

## 関連ファイル

- `issues/open/issue-task-c-eventsub/README.md`
- `issues/index.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
