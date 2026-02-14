# issue-task-j-logs-debug-sse TASK J: ログ + デバッグ + SSE

- 状態: Open
- 優先度: 低
- 担当: 未定
- 期限: 未定

## 概要

旧 `docs/TASK_J_LOGS_DEBUG_SSE.md` から移植した未完了タスクを、このIssue本文で追跡する。

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

### J-1. ログストリーミングWebSocket

**変更対象**: `src-tauri/src/server/api/logs.rs`

**`GET /api/logs/stream`** (WebSocket):
- `tracing` subscriber からログメッセージをキャプチャ
- カスタム `tracing::Layer` を実装し、ログを `broadcast::Sender` に転送
- WebSocket接続時にリアルタイム配信

```rust
struct WsLogLayer {
    sender: broadcast::Sender<LogEntry>,
}

struct LogEntry {
    timestamp: String,
    level: String,    // "INFO", "WARN", "ERROR", "DEBUG"
    target: String,   // モジュールパス
    message: String,
}

impl<S: Subscriber> Layer<S> for WsLogLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        // ログエントリをbroadcast
    }
}
```

**参考**: `internal/webserver/logs_api.go:1-100`

### J-2. ログダウンロード

**変更対象**: `src-tauri/src/server/api/logs.rs`

**`GET /api/logs/download`**:
- クエリパラメータ: `?format=json` or `?format=text`
- JSON形式: 各行が `LogEntry` のJSON
- TEXT形式: `[timestamp] [LEVEL] target: message` 形式
- ログバッファ（最新N件）をメモリ保持（リングバッファ）
- `Content-Disposition: attachment; filename="logs-{timestamp}.{ext}"`

**参考**: `internal/webserver/logs_api.go:100-249`

### J-3. SSEエンドポイント

**変更対象**: `src-tauri/src/server/sse.rs` (新規)

**`GET /api/settings/overlay/events`** (SSE):
- オーバーレイ設定変更時にリアルタイム通知
- axum の `Sse<impl Stream<Item = Event>>` で実装
- 設定変更 → `broadcast::Sender` → SSE接続クライアントに配信

```rust
async fn overlay_events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.overlay_events_tx.subscribe();
    let stream = BroadcastStream::new(rx)
        .map(|msg| {
            Ok(Event::default()
                .event("settings_update")
                .data(serde_json::to_string(&msg.unwrap()).unwrap()))
        });
    Sse::new(stream)
        .keep_alive(axum::response::sse::KeepAlive::default())
}
```

- オーバーレイ設定保存時 (`POST /api/settings/overlay`) にイベント発行
- イベントデータ: 変更された設定のJSON

**参考**: `internal/webserver/overlay_settings_api.go` のSSE部分

### J-4. デバッグエンドポイント (13個)

**変更対象**: `src-tauri/src/server/api/debug.rs` (新規 or 既存拡張)

`DEBUG_MODE=true` 環境変数が有効な場合のみルート登録:

| # | Method | Path | 用途 |
|---|--------|------|------|
| 1 | POST | `/debug/fax` | FAX受信シミュレーション |
| 2 | POST | `/debug/channel-points` | チャンネルポイント使用シミュレーション |
| 3 | POST | `/debug/clock` | 時計印刷シミュレーション |
| 4 | POST | `/debug/follow` | フォロー通知シミュレーション |
| 5 | POST | `/debug/cheer` | Bits応援シミュレーション |
| 6 | POST | `/debug/subscribe` | サブスクシミュレーション |
| 7 | POST | `/debug/gift-sub` | ギフトサブシミュレーション |
| 8 | POST | `/debug/resub` | リサブシミュレーション |
| 9 | POST | `/debug/raid` | レイドシミュレーション |
| 10 | POST | `/debug/shoutout` | シャウトアウトシミュレーション |
| 11 | POST | `/debug/stream-online` | 配信開始シミュレーション |
| 12 | POST | `/debug/stream-offline` | 配信終了シミュレーション |
| 13 | GET | `/api/debug/printer-status` | プリンター状態取得/変更 |

各デバッグエンドポイントは対応するイベントハンドラーを直接呼び出す:
```rust
// 例: /debug/follow
async fn debug_follow(State(state): State<AppState>) -> impl IntoResponse {
    let mock_event = FollowEvent {
        user_name: "test_user".to_string(),
        user_id: "12345".to_string(),
        followed_at: Utc::now().to_rfc3339(),
    };
    handle_channel_follow(&state, mock_event).await;
    Json(json!({"ok": true}))
}
```

ルート登録の条件分岐:
```rust
let router = if std::env::var("DEBUG_MODE").unwrap_or_default() == "true" {
    router.merge(debug_routes())
} else {
    router
};
```

**参考**: `internal/webserver/debug_api.go`, `internal/webserver/debug_printer.go`

### J-5. ログバッファ管理

**変更対象**: `src-tauri/src/server/api/logs.rs`

- リングバッファ（最新10,000件）をメモリ保持
- `tokio::sync::RwLock<VecDeque<LogEntry>>` で管理
- ダウンロード時にバッファ全体を返す
- WebSocket接続時に最新100件を初期送信

---


## 完了条件

- [x] `/api/logs/stream` WebSocketでリアルタイムログが受信できる
- [x] `/api/logs/download` でJSON/TEXT形式のログがダウンロードできる
- [ ] `GET /api/settings/overlay/events` SSEでオーバーレイ設定変更が通知される
- [ ] `DEBUG_MODE=true` で13個のデバッグエンドポイントが利用可能
- [ ] `DEBUG_MODE` 未設定時はデバッグエンドポイントが404を返す
- [ ] 各デバッグエンドポイントが対応するイベントハンドラーを正しく呼び出す


## 進捗メモ（2026-02-12）

- `src-tauri/src/services/log_buffer.rs` を追加し、`tracing::Layer` + リングバッファ + broadcast配信を実装
- `src-tauri/src/lib.rs` のsubscriber初期化に `LogCaptureLayer` を組み込み
- `src-tauri/src/server/api/logs.rs` を実データ化
  - `GET /api/logs` はバッファから履歴返却
  - `POST /api/logs/clear` はバッファ消去
  - `GET /api/logs/download` は `json/text` を返却
  - `GET /api/logs/stream` は初期履歴 + リアルタイム配信

---


## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `internal/webserver/logs_api.go` | 249 | ログストリーミング + ダウンロード |
| `internal/webserver/debug_api.go` | - | 12個のデバッグエンドポイント |
| `internal/webserver/debug_printer.go` | 35 | プリンター状態デバッグ |
| `internal/webserver/overlay_settings_api.go` | 984 | SSE部分 |

## レビュー観点

- 移植元TASK文書の具体項目が漏れず反映されているか
- 受け入れ条件が検証可能な粒度になっているか
- 1Issue 1PRで進められる分割になっているか

## TODO ID連携

- なし

## 関連ファイル

- `issues/open/issue-task-j-logs-debug-sse/README.md`
- `issues/index.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
