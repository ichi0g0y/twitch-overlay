# Tauri移行 実行スプリント計画（2026-02-12）

> 運用メモ: 進行中タスクの正本は `issues/` へ移行しました。
> 移行先Issue: `issues/open/issue-tauri-migration-plan-backlog/README.md`


## 1. 目的
`docs/TAURI_MIGRATION_PLAN.md` の中長期計画を、今すぐ実装可能な短期スプリントへ落とし込む。

## 2. 現状スナップショット（2026-02-12 時点）
- APIスモーク: `DRY_RUN_MODE=true task smoke:api` は **27/27 PASS**。
- API互換: 主要エンドポイントは概ね復旧済み。
- 起動モード: ヘッドレスバイナリ `cairo-overlay-server` は存在。
- 進捗の実態:
  - EventSub: 接続と11種購読は実装済み。ハンドラーのドメイン処理は一部のみ。
  - 通知: キュー処理とイベント配信は実装済み。ウィンドウ実体の統合は未完。
  - ウィンドウ管理: Monitor API/位置保存復元は実装済み。
  - 印刷: スキャン/テスト/再接続/USB列挙は実装済み。**非DryRunの実印刷経路**は未完。
  - 画像: text/message/clock/qr/compose モジュールが追加済み。

## 3. 現時点のブロッカー（2026-02-13 更新）
1. `task dev` / `task dev:quick` のバイナリ曖昧性: 解消済み。
2. `/api/printer/test-print` の非DryRun 501: 解消済み。
3. `/api/settings/font/preview` の 501: 解消済み。
4. EventSub 11種の副作用不足: 解消済み。

## 4. 今スプリントの実行項目（優先順）

### Sprint-1: 開発導線の安定化（P0）
- [x] `task dev` / `task dev:quick` を `--bin cairo-overlay-server` 付きで起動。
- 完了条件:
  - `DRY_RUN_MODE=true task dev:quick` で起動エラーにならない。

### Sprint-2: 印刷実処理の閉塞解消（P1）
- [x] `/api/printer/test-print` の非DryRun経路を実装。
- [x] `services/print_queue.rs` の BLE TODO を解消（エンコード→送信）。
- 対象:
  - `src-tauri/src/server/api/printer.rs`
  - `src-tauri/src/services/print_queue.rs`
  - `src-tauri/src/services/printer.rs`
- 完了条件:
  - DryRun=false かつ設定済みプリンターで 501 が消える。
  - 失敗時は JSON エラーを返し、ログに原因が残る。

### Sprint-3: EventSub処理の機能等価化（P1）
- [x] 11イベントそれぞれの処理方針を `eventsub_handler.rs` に実装。
- [x] 必要なイベントをDB更新・WS通知・（必要なら）通知キューへ接続。
- 対象:
  - `src-tauri/src/eventsub_handler.rs`
  - `src-tauri/src/services/*`（必要箇所のみ）
- 完了条件:
  - 11種イベントが「受信しただけ」ではなく、Go版相当の副作用を持つ。

### Sprint-4: UI補完（P2）
- [x] `font preview` API 実装（501解消）。
- [x] 通知ウィンドウ（WebviewWindow）作成/表示/位置反映を接続。
- 対象:
  - `src-tauri/src/server/api/font.rs`
  - `src-tauri/src/notification/window.rs`
  - `src-tauri/src/notification/queue.rs`
- 完了条件:
  - `/api/settings/font/preview` が200で画像レスポンスを返す。
  - 通知表示モード queue/overwrite が実ウィンドウ上で動作。

## 5. 実行順序
1. Sprint-1（開発導線）
2. Sprint-2（印刷実処理）
3. Sprint-3（EventSub等価化）
4. Sprint-4（UI補完）

## 6. 検証コマンド
```bash
# API互換
DRY_RUN_MODE=true task smoke:api

# ヘッドレス起動
DRY_RUN_MODE=true task dev:quick

# テスト
DRY_RUN_MODE=true task test
```

## 7. 更新ルール
- 進行管理・実行順序・チェックボックス更新は `issues/` 側（`issues/open/issue-tauri-migration-plan-backlog/README.md`）を正本として更新する。
- 本ファイルは 2026-02-12 時点の計画スナップショットとして扱い、履歴参照用途に限定する。
- 大きな方針変更のみ `docs/TAURI_MIGRATION_PLAN.md` に反映する。
