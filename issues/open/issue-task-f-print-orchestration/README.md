# issue-task-f-print-orchestration TASK F: 印刷オーケストレーション

- 状態: Open
- 優先度: 中
- 担当: 未定
- 期限: 未定

## 概要

旧 `docs/TASK_F_PRINT_ORCHESTRATION.md` から移植した未完了タスクを、このIssue本文で追跡する。

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

### F-1. 印刷ジョブキュー

**新規作成**: `src-tauri/src/print/mod.rs`, `src-tauri/src/print/queue.rs`

```rust
struct PrintJob {
    image_mono: Vec<u8>,      // モノクロ画像データ
    image_color: Vec<u8>,     // カラー画像データ（FAX保存用）
    title: Option<String>,
    force: bool,              // Dry-Run無視フラグ
}
```

- `tokio::sync::mpsc` (バッファ1000) でキューイング
- `print_out()` / `print_out_with_title()` / `print_clock()` エントリポイント
- カラー画像 + モノクロ画像を `tokio::join!` で並行生成

**参考**: `internal/output/printout.go:1-100`

### F-2. 印刷ワーカータスク

**新規作成**: `src-tauri/src/print/worker.rs`

常駐tokioタスク:
1. キューからジョブ取得 (recv().await)
2. `should_use_dry_run()` チェック
3. Dry-Runでなければ:
   - `create_printer_backend()` でバックエンド選択 (BLE/USB)
   - `connect()` → `print(image_mono)` → `disconnect()`
4. 失敗時: 5秒待機 → リトライ
5. 成功時: `print_success` emit、失敗時: `print_error` emit

**参考**: `internal/output/printout.go:100-250`

### F-3. FAX保存 + SSEブロードキャスト

印刷前にカラー画像をFAXとして保存:
1. FaxManager に保存 (DB + ファイルI/O)
2. SSEで `fax_received` をブロードキャスト
3. WebSocketでも `fax_received` をブロードキャスト

**参考**: `internal/output/printout.go:250-350`

### F-4. 定時処理: clockRoutine

**新規作成**: `src-tauri/src/print/clock.rs`

- `tokio::time::interval(Duration::from_secs(1))` で毎秒チェック
- 毎正時 (分==0, 秒==0) に `print_clock()` を実行
- 月変化検知: 前回の月と異なる場合は統計画像を含む時計を印刷

**参考**: `internal/output/printout.go:350-420`

### F-5. 定時処理: keepAliveRoutine

- 設定の `KEEP_ALIVE_INTERVAL` 秒間隔でtick
- 最終印刷から5秒以上経過していればKeepAlive実行
- 印刷中はスキップ

**参考**: `internal/output/printout.go:420-480`

### F-6. Dry-Run二重制御

```rust
fn should_use_dry_run(settings: &AppConfig, stream_status: &StreamStatus) -> bool {
    if settings.dry_run_mode { return true; }
    if settings.auto_dry_run_when_offline && !stream_status.is_live { return true; }
    false
}
```

- `DRY_RUN_MODE=true` → 常にDry-Run
- `AUTO_DRY_RUN_WHEN_OFFLINE=true` かつ配信オフライン → 自動Dry-Run
- `PrintJob.force = true` → Dry-Runを無視して強制印刷

**参考**: `internal/output/printout.go:480-530`

---


## 完了条件

- [ ] EventSubイベント → 画像生成 → キューイング → 印刷が一連で動作
- [ ] 毎正時に時計印刷が実行される
- [ ] KeepAliveが設定間隔で実行される
- [ ] `DRY_RUN_MODE=true` で印刷がスキップされログのみ出力
- [ ] オフライン時の自動Dry-Runが機能
- [ ] `Force` フラグでDry-Runを無視できる
- [ ] FAX保存 → SSE/WSブロードキャストが動作

---


## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `internal/output/printout.go` | 578 | 全印刷オーケストレーション |

## レビュー観点

- 移植元TASK文書の具体項目が漏れず反映されているか
- 受け入れ条件が検証可能な粒度になっているか
- 1Issue 1PRで進められる分割になっているか

## TODO ID連携

- なし

## 関連ファイル

- `issues/open/issue-task-f-print-orchestration/README.md`
- `issues/index.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
