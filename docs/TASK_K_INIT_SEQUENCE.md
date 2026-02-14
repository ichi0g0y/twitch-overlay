# TASK K: 起動時初期化統合

> 運用メモ: 進行中タスクの正本は `issues/` へ移行しました。
> 移行先Issue: `issues/open/ISSUE-0013-issue-task-k-init-sequence/README.md`


- 優先度: **P1**
- 見積: 1日
- 依存: Phase B, C, D, F, G, H（全ての初期化対象モジュール）
- ブロック: Phase L（仕上げ）

---

## 目的

Go版 `app.go` と `cmd/server/main.go` の16ステップ初期化シーケンスをTauri側の `app.rs` に統合する。順序依存関係を正しく維持しつつ、各フェーズで実装されたモジュールを起動シーケンスに組み込む。

---

## タスク

### K-1. 初期化シーケンス全体設計

**変更対象**: `src-tauri/src/app.rs`

16ステップを順序通りに実行する `initialize()` 関数:

```rust
pub async fn initialize(app: &AppHandle) -> Result<AppState> {
    // === Phase 1: 基盤（すべて実装済み ✅）===
    // 1. tracing 初期化
    init_tracing()?;

    // 2. データディレクトリ確保
    ensure_data_dirs(app)?;

    // 3. DB初期化
    let db = init_database(app)?;

    // 4. ワードフィルターシーディング
    seed_word_filter(&db)?;

    // 5. 環境変数/設定読み込み (DB優先 → .env → 環境変数)
    let settings = load_settings(&db)?;

    // === Phase 2: アプリケーションサービス ===
    // 6. 抽選参加者DB読み込み ← Phase G
    load_lottery_participants(&db)?;

    // 7. フォントマネージャー初期化 ✅
    init_font_manager(&db)?;

    // 8. 画像キャッシュ初期化 (50MB制限) ✅
    init_image_cache(&db, &settings)?;

    // 9. 音楽DB初期化 ✅
    init_music(&db)?;

    // === Phase 3: 外部接続 ===
    // 10. プリンター初期化 + KeepAliveタスク ← Phase D
    init_printer(&settings).await?;

    // 11. 配信状態取得 ← Phase B
    check_stream_status(&settings).await?;

    // 12. Twitchトークン取得/リフレッシュ ← Phase B
    refresh_twitch_token(&db, &settings).await?;

    // 13. EventSub WebSocket接続開始 ← Phase C
    start_eventsub(&settings).await?;

    // === Phase 4: UI・サーバー ===
    // 14. 通知システム初期化 ← Phase H
    init_notification(app, &db, &settings)?;

    // 15. axum Webサーバー起動 ✅
    start_web_server(&settings).await?;

    // 16. トークン自動リフレッシュタスク開始 ← Phase B
    spawn_token_refresh_task(&db, &settings);

    Ok(app_state)
}
```

**参考**: `app.go:100-200` Startup()、`cmd/server/main.go:25-115`

### K-2. エラーハンドリング戦略

**変更対象**: `src-tauri/src/app.rs`

各ステップのエラー分類:

| ステップ | エラー時の挙動 |
|---------|--------------|
| 1-5 (基盤) | **致命的** — 起動中断、エラー表示して終了 |
| 6-9 (サービス) | **警告** — ログ出力して続行 |
| 10 (プリンター) | **警告** — BLE/USB接続失敗はログ出力して続行 |
| 11-12 (Twitch) | **警告** — オフラインモードで続行 |
| 13 (EventSub) | **警告** — 後でバックグラウンドリトライ |
| 14 (通知) | **警告** — 通知なしモードで続行 |
| 15 (Webサーバー) | **致命的** — ポート競合等は起動中断 |
| 16 (自動リフレッシュ) | **警告** — ログ出力して続行 |

### K-3. ステップ10: プリンター初期化統合

**変更対象**: `src-tauri/src/app.rs`

Phase D で実装されたプリンター接続を起動シーケンスに統合:

1. 設定から接続タイプ (BLE/USB) と接続先を取得
2. BLEの場合:
   - macOS: Bluetooth安全機構チェック（Phase D-8）
   - デバイスアドレスで接続試行
   - 接続成功 → KeepAliveタスク開始（Phase F-5）
3. USBの場合:
   - `lpstat` でプリンター存在確認
4. 接続失敗 → ログ出力、後で手動接続

**参考**: `cmd/server/startup.go:160-194` initializeBluetoothPrinter

### K-4. ステップ11-12: Twitch初期化統合

**変更対象**: `src-tauri/src/app.rs`

Phase B で実装されたTwitch機能を起動シーケンスに統合:

1. DBからトークン取得
2. トークンが存在しない → スキップ（手動認証を促す）
3. トークン有効性チェック（`https://id.twitch.tv/oauth2/validate`）
4. 期限切れ → リフレッシュ実行
5. ユーザー情報取得（broadcaster_user_id）
6. 配信状態チェック → ステータス更新

**参考**: `cmd/server/startup.go:129-158` checkInitialStreamStatus

### K-5. ステップ13: EventSub起動統合

**変更対象**: `src-tauri/src/app.rs`

Phase C で実装されたEventSubを起動シーケンスに統合:

1. Twitchトークンが有効な場合のみ起動
2. `tokio::spawn` で非同期タスクとして起動
3. 接続失敗時は指数バックオフでリトライ
4. 接続成功 → 11種イベント購読登録

**参考**: `app.go:1380-1400` EventSub起動

### K-6. ステップ14: 通知システム起動統合

**変更対象**: `src-tauri/src/app.rs`

Phase H で実装された通知システムを起動シーケンスに統合:

1. 通知設定を読み込み
2. `NOTIFICATION_ENABLED=true` の場合のみ初期化
3. スクリーン情報プロバイダー登録（Tauri Monitor API）
4. 通知キューワーカータスク起動

**参考**: `app.go:800-900` notification.Initialize

### K-7. レガシー設定マイグレーション

**変更対象**: `src-tauri/src/app.rs`

ヘッドレスサーバーモードの `startup.go` にあるマイグレーション処理:

- 翻訳設定の正規化: ISO639-3コード → Chrome言語コード
- 例: `jpn` → `ja`, `eng` → `en`, `kor` → `ko`
- DB内の設定値を自動変換

**参考**: `cmd/server/startup.go:17-127` migrateLegacyTranslationSettings

### K-8. グレースフルシャットダウン

**変更対象**: `src-tauri/src/app.rs`

Ctrl+C / ウィンドウクローズ時のクリーンアップ:

1. EventSub WebSocket切断
2. プリンター切断
3. 通知ウィンドウクローズ
4. KeepAliveタスク停止
5. トークンリフレッシュタスク停止
6. axumサーバー停止
7. DB接続クローズ

`tokio::signal::ctrl_c()` と Tauri `CloseRequested` イベントの両方に対応。

**参考**: `cmd/server/main.go:147-158` シグナルハンドリング

---

## 完了条件

- [ ] 16ステップの初期化が正しい順序で実行される
- [ ] 基盤ステップ (1-5) のエラーで起動が中断される
- [ ] サービスステップ (6-9) のエラーで起動が続行される
- [ ] プリンター接続が起動時に自動実行される（設定がある場合）
- [ ] Twitchトークンが起動時にリフレッシュされる（トークンがある場合）
- [ ] EventSubが起動時に自動接続される（トークンが有効な場合）
- [ ] 通知システムが起動時に初期化される（有効な場合）
- [ ] グレースフルシャットダウンが正常に動作する
- [ ] レガシー設定マイグレーションが起動時に実行される

---

## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `app.go` | 2,100 | Startup() 初期化シーケンス |
| `cmd/server/main.go` | 159 | ヘッドレスモード初期化 |
| `cmd/server/startup.go` | 194 | 初期化ヘルパー（マイグレーション、配信状態、BT） |
| `cmd/server/twitch.go` | 129 | Twitchバックグラウンドタスク |
