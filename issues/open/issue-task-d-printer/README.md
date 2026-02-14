# issue-task-d-printer TASK D: Printer復旧

- 状態: Open
- 優先度: 中
- 担当: 未定
- 期限: 未定

## 概要

旧 `docs/TASK_D_PRINTER.md` から移植した未完了タスクを、このIssue本文で追跡する。

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

### D-1. BLEスキャン実装

**変更対象**: `crates/catprinter/src/ble.rs`, `src-tauri/src/server/api/printer.rs`

**`POST /api/printer/scan`**:
- btleplug でBLEデバイススキャン（10秒タイムアウト）
- サービスUUID `ae30`（macOSフォールバック: `af30`）でフィルタリング
- 検出デバイス一覧を返す: `[{"name": "GB03", "address": "XX:XX:XX:XX"}]`

**参考**: `internal/output/bluetooth_client.go:1-80`

### D-2. BLE接続テスト

**変更対象**: `crates/catprinter/src/ble.rs`, `src-tauri/src/server/api/printer.rs`

**`POST /api/printer/test`**:
- 指定アドレスのデバイスに接続
- MTUネゴシエーション（接続後1秒待機）
- デバイス情報取得 (GetDevState)
- 接続成功/失敗を返す
- テスト後切断

### D-3. プリンターステータス

**`GET /api/printer/status`**:
- 現在の接続状態を返す
- `{"connected": bool, "type": "ble"|"usb"|null, "name": "..."}`

### D-4. 再接続

**`POST /api/printer/reconnect`**:
- 現在の接続を切断 → 再接続
- KeepAlive Level 1 (同一インスタンス再利用)
- 失敗時 Level 2 (インスタンス再生成)

### D-5. テスト印刷

**`POST /api/printer/test-print`**:
- 384px幅のテスト画像を生成
- `DRY_RUN_MODE=true` 時はログ出力のみ
- 画像 → プロトコルエンコード → BLE送信

**参考**: `internal/output/bluetooth_client.go:200-310`

### D-6. USBプリンター実装

**変更対象**: `crates/catprinter/src/usb.rs` (新規実装)

**`GET /api/printer/system-printers`**:
- `lpstat -p` コマンドでCUPSプリンター一覧取得
- パース: `printer <name> is idle.` 形式
- `[{"name": "EPSON_TM", "status": "idle"}]`

**USB印刷**:
- `lpr -P <name> -o media=Custom.{w}x{h}mm <file>` で印刷
- 用紙サイズ動的計算: 幅53mm固定、高さ = 画像高さ/画像幅 * 53mm
- 一時ファイル: `/tmp/twitch-overlay-print/` に保存→印刷後削除

**参考**: `internal/output/usb_printer.go` (201行)

### D-7. KeepAlive実装

**変更対象**: `crates/catprinter/src/keepalive.rs`

- **Level 1**: Disconnect → 500ms wait → Reconnect (同一インスタンス)
- **Level 2**: Stop (インスタンス破棄) → 新インスタンス作成 → Connect
  - トリガー: "already exists", "connection canceled", "can't dial", "broken pipe"
- 設定: `KEEP_ALIVE_ENABLED`, `KEEP_ALIVE_INTERVAL`

**参考**: `internal/output/bluetooth_client.go:150-310`

### D-8. Bluetooth安全機構 (macOS)

**変更対象**: `crates/catprinter/src/` 内

- .appバンドル検出 (Info.plist存在チェック)
- CoreBluetooth abort trap防止
- "central manager has invalid state" 時 500ms×6回リトライ

**参考**: `internal/output/bluetooth_safety.go` (48行)

---


## 完了条件

- [ ] BLEスキャンでデバイスが検出される
- [ ] BLE接続テストが成功する
- [x] テスト印刷が実行される（`DRY_RUN_MODE=true`）
- [ ] USBプリンターが`lpstat`で列挙される
- [ ] KeepAlive Level 1/2 が動作する
- [ ] macOS CoreBluetooth安全機構が機能する
- [ ] 設定画面のプリンター操作がすべて期待通り動作


## 進捗メモ（2026-02-12）

- `src-tauri/src/server/api/printer.rs` で `scan/test/status/reconnect/system-printers` の501スタブを撤去
- `src-tauri/src/services/printer.rs` を追加し、以下を実装
  - BLEスキャン（`ae30` + macOSフォールバック `af30`）
  - BLE接続テスト（接続後1秒待機→切断）
  - reconnect経路でKeepAlive Level 1/2分岐
  - `lpstat -p` によるCUPSプリンター列挙
- 非DryRunの実印刷パイプライン（画像生成→送信）は未実装

---


## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `internal/output/bluetooth_client.go` | 310 | BLE接続・送信・KeepAlive |
| `internal/output/usb_printer.go` | 201 | CUPS USB印刷 |
| `internal/output/bluetooth_safety.go` | 48 | macOS安全機構 |

## レビュー観点

- 移植元TASK文書の具体項目が漏れず反映されているか
- 受け入れ条件が検証可能な粒度になっているか
- 1Issue 1PRで進められる分割になっているか

## TODO ID連携

- なし

## 関連ファイル

- `issues/open/issue-task-d-printer/README.md`
- `issues/index.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
