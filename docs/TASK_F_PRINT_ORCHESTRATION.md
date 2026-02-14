# TASK F: 印刷オーケストレーション

> 運用メモ: 進行中タスクの正本は `issues/` へ移行しました。
> 移行先Issue: `issues/open/ISSUE-0008-issue-task-f-print-orchestration/README.md`


- 優先度: **P2**
- 見積: 1-2日
- 依存: Phase D（Printer）+ Phase E（Image Engine）
- ブロック: Phase K（初期化統合）

---

## 目的

Go版 `printout.go` (578行) の印刷ジョブキュー、定時処理、Dry-Run制御をTauri側に移植する。

---

## タスク

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
