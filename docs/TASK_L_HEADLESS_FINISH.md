# TASK L: ヘッドレスモード + 仕上げ

> 運用メモ: 進行中タスクの正本は `issues/` へ移行しました。
> 移行先Issue: `issues/open/ISSUE-0014-issue-task-l-headless-finish/README.md`


- 優先度: **P3**
- 見積: 1-2日
- 依存: Phase K（初期化統合が完了していること）
- ブロック: なし（最終フェーズ）

---

## 目的

Go版 `cmd/server/` (482行) 相当のヘッドレスバイナリを用意し、ドキュメント更新・不要コード整理・回帰テストで移行を完了させる。

---

## タスク

### L-1. ヘッドレスバイナリ

**新規作成**: `src-tauri/src/bin/server.rs` or 別crateとして分離

Tauri依存なしの軽量バイナリ:
- axum Webサーバーのみ起動
- Tauri `AppHandle` / `WebviewWindow` を使用しない
- DB、設定、WebSocket、SSE は通常通り動作
- プリンター接続は設定に基づいて自動実行

```rust
// src-tauri/src/bin/server.rs
#[tokio::main]
async fn main() -> Result<()> {
    // Phase K の初期化シーケンスからTauri固有ステップ(14)を除外
    // ステップ 1-13, 15-16 を実行

    // シグナルハンドリング
    tokio::signal::ctrl_c().await?;
    // グレースフルシャットダウン
}
```

ビルドコマンド:
```bash
cargo build --bin server --release
# Tauriランタイムに依存しないため、サーバー環境でも動作
```

**参考**: `cmd/server/main.go` (159行)

### L-2. macOS Bluetooth権限プリフライト

**変更対象**: ヘッドレスバイナリ内

- macOSではBluetooth使用時にシステム許可ダイアログが表示される
- ヘッドレスモードではダイアログを早期に表示するための処理が必要
- 環境変数 `SKIP_BLUETOOTH_PREFLIGHT=true` でスキップ可能

```rust
#[cfg(target_os = "macos")]
fn bluetooth_preflight() {
    if std::env::var("SKIP_BLUETOOTH_PREFLIGHT").unwrap_or_default() == "true" {
        return;
    }
    // btleplug のアダプター取得を試みて権限ダイアログを表示
}
```

**参考**: `cmd/server/main.go:75-112`

### L-3. Taskfile更新

**変更対象**: `Taskfile.yml`

```yaml
dev:
  desc: "ヘッドレスモードで起動（Webサーバーのみ）"
  cmds:
    - cargo run --bin server

dev:tauri:
  desc: "Tauriウィンドウモードで起動"
  cmds:
    - cargo tauri dev

build:server:
  desc: "ヘッドレスバイナリをビルド"
  cmds:
    - cargo build --bin server --release

build:tauri:
  desc: "Tauriアプリをビルド"
  cmds:
    - cargo tauri build
```

### L-4. API互換の最終検証

すべてのAPIエンドポイント（~60個）の動作確認:

Phase A で作成したスモークテストスクリプトを拡張:
- 全エンドポイントのHTTPステータスコード検証
- JSON応答のスキーマ検証（主要フィールドの存在確認）
- WebSocketメッセージタイプ9種+の送受信テスト
- SSEイベント受信テスト

```bash
# スモークテスト実行
DRY_RUN_MODE=true ./scripts/smoke_test.sh
```

### L-5. 不要互換コードの整理

移行中に作成した互換レイヤーのうち、不要になったものを整理:

- `/api/lottery*` → `/api/present/*` への移行が完了したら旧パス削除
- `/api/music/state/get` → `/api/music/state` の互換ルート削除
- `/api/settings/font/file` → `/api/font/data` の互換ルート削除
- デッドコード（使用されていないスタブ関数）の削除

**注意**: フロントエンドの参照先を事前に確認してから削除

### L-6. ドキュメント更新

**変更対象**: `README.md`, `CLAUDE.md`

更新内容:
1. **README.md**:
   - プロジェクト構成をTauriベースに更新
   - ビルド手順をRust/Cargoベースに更新
   - 環境変数リストの更新
   - デプロイ手順の更新

2. **CLAUDE.md**:
   - 開発フローをTauriベースに更新
   - `task dev` / `task dev:tauri` の説明更新
   - Goテストガイドラインの代わりにRustテストガイドラインを追加
   - ディレクトリ構成の更新

3. **docs/TAURI_MIGRATION_PLAN.md**:
   - 全フェーズのチェックボックスを更新
   - 完了条件の最終確認

### L-7. 回帰テスト

全機能の最終テスト:

```bash
# Rust単体テスト
DRY_RUN_MODE=true cargo test --workspace

# フロントエンドビルド
cd frontend && bun run build && cd ..
cd web && bun run build && cd ..

# ヘッドレスモード起動テスト
DRY_RUN_MODE=true cargo run --bin server &
# スモークテスト実行
./scripts/smoke_test.sh
# 停止
kill %1

# Tauriモード起動テスト
DRY_RUN_MODE=true cargo tauri dev
```

### L-8. 実機テスト項目（人間が実行）

以下は自動テストでカバーできない項目。人間が手動で実施:

- [ ] BLEプリンター接続・印刷（GB + MXW01）
- [ ] USBプリンター接続・印刷
- [ ] Twitch OAuth フロー（ブラウザリダイレクト→コールバック）
- [ ] EventSub 11種イベント受信（ライブ配信中にテスト）
- [ ] OBS オーバーレイ表示（ブラウザソースで確認）
- [ ] 通知マルチウィンドウ（queue/overwriteモード）
- [ ] プレゼント抽選フロー（参加→抽選→当選表示）
- [ ] マルチモニター（ウィンドウ位置復元、モニター切替）
- [ ] KeepAlive安定性（長時間接続維持）
- [ ] Dry-Run二重制御（オフライン自動Dry-Run）

---

## 完了条件

- [ ] ヘッドレスバイナリが正常に起動し、WebサーバーからDashboard/Overlayが利用可能
- [ ] `task dev` でヘッドレスモード起動
- [ ] `task dev:tauri` でウィンドウモード起動
- [ ] 全~60 APIエンドポイントがJSONで期待通り応答
- [ ] 不要な互換コードが削除されている
- [ ] README / CLAUDE.md がTauriベースに更新されている
- [ ] 回帰テスト（自動+手動）が全て通過
- [ ] TAURI_MIGRATION_PLAN.md の全チェックボックスが完了

---

## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `cmd/server/main.go` | 159 | ヘッドレスサーバーエントリポイント |
| `cmd/server/startup.go` | 194 | 初期化ヘルパー |
| `cmd/server/twitch.go` | 129 | Twitchバックグラウンドタスク |
| `Taskfile.yml` | - | タスクランナー設定 |
