# Wails (Go) → Tauri (Rust) 移行計画

> 運用メモ: 進行中タスクの正本は GitHub Issues だす。
> 移行先Issue: https://github.com/ichi0g0y/twitch-overlay/issues/24


- 更新日: 2026-02-12
- 対象ブランチ: `develop`（実装は作業ブランチで進行）
- ステータス: **移行中（約70-75%完了）**

---

## 1. 目的

Tauri版を「Wails版と同等の運用フロー」で安定稼働させる。

- **動機**: mijincoがRustベースのため、overlayもRustに統一してコード共有を可能にする
- **overlay = sandbox**: 試作→mijinco移植の運用で、言語統一により移植コスト恒久ゼロ
- **開発体制**: Claude Code / Codex によるAI開発が前提
- **運用形態**: 通常はヘッドレス起動（バックエンドWebサーバー）、ダッシュボードはブラウザ経由
- **フロントエンド**: HTTP/WebSocket経由で通信 → **フロントエンド変更は最小限**

---

## 2. アーキテクチャ

### 2.1 Go側の現状（実測値）

```
Go + Wails v3  (~24,400行)
├── app.go             -- 65+のWails公開メソッド (2,100行)
│                         14のWails Emitイベント
├── window_darwin.go   -- CGO実装 (9つのGo wrapper関数)
├── main.go            -- エントリポイント (embed.FS: frontend/web)
├── cmd/server/        -- ヘッドレスサーバーモード (482行)
├── frontend/          -- Settings UI (React 18, HTTP API経由)
├── web/               -- OBS Overlay (React 19, HTTP API経由)
└── internal/          -- Goバックエンド
    ├── webserver/        -- HTTP+WS+SSEサーバー (~60 APIエンドポイント)
    │   ├── server.go           (1,667行, ルート定義+Dual-SPA配信)
    │   ├── websocket.go        (375行, 9+メッセージタイプ)
    │   ├── present_handler.go  (968行, 抽選全機能)
    │   ├── overlay_settings_api.go (984行, SSE含む)
    │   ├── reward_groups_api.go (492行)
    │   ├── reward_counts_api.go (273行)
    │   ├── logs_api.go          (249行, WS+ダウンロード)
    │   ├── music_*.go           (3ファイル)
    │   ├── debug_api.go         (13個のデバッグエンドポイント)
    │   └── その他API (twitch, settings, font, cache, chat, word_filter)
    ├── output/           -- プリンター制御 (BLE/USB)
    │   ├── image.go            (1,824行, 画像生成エンジン)
    │   ├── printout.go         (578行, 印刷ジョブオーケストレーション)
    │   ├── bluetooth_client.go (310行, BLE接続+KeepAlive)
    │   ├── usb_printer.go      (201行, CUPS連携)
    │   └── bluetooth_safety.go (48行, macOS CoreBluetooth安全機構)
    ├── notification/     -- デスクトップ通知 (850行)
    ├── twitcheventsub/   -- Twitch EventSub (468行, 11種イベント購読)
    ├── twitchapi/        -- Twitch REST API
    ├── twitchtoken/      -- OAuth トークン管理
    ├── localdb/          -- SQLite (1,850行, 11テーブル)
    ├── settings/         -- 設定管理 (884行, 3段階フォールバック)
    ├── music/            -- 音楽管理
    ├── wordfilter/       -- 不適切語フィルタ (20言語)
    ├── cache/            -- 画像キャッシュ (583行, SHA1, 50MB制限)
    ├── fontmanager/      -- フォント管理
    ├── faxmanager/       -- FAX画像管理
    ├── broadcast/        -- イベントブロードキャスト
    ├── status/           -- ストリーム/プリンター状態
    ├── shared/           -- ロガー, パス管理
    ├── types/            -- 共有型定義
    └── version/          -- バージョン情報 (24行)
```

### 2.2 規模サマリー

| 指標 | 数値 |
|------|------|
| Go総行数 | ~24,400行 |
| Wails公開メソッド | 65+ |
| APIエンドポイント | ~60 |
| WebSocketメッセージタイプ | 9種+ |
| SSEエンドポイント | 1 |
| Wails Emitイベント | 14種 |
| EventSub購読イベント | 11種 |
| CGO Go wrapper関数 | 9個 |
| デバッグエンドポイント | 13個 |
| SQLiteテーブル | 11 |
| 初期化ステップ | 16 |

### 2.3 Tauri側の目標構造

```
src-tauri/
├── Cargo.toml                # workspace root
├── src/
│   ├── main.rs               # エントリポイント
│   ├── app.rs                # アプリ状態・ライフサイクル・初期化シーケンス
│   ├── commands/             # Tauri コマンド (設定画面用)
│   ├── events.rs             # 14種 Tauri emit イベント定義
│   ├── window/               # ウィンドウ管理 (CGO関数の代替)
│   ├── notification/         # 通知システム (850行相当)
│   ├── print/                # 印刷ジョブオーケストレーション (578行相当)
│   ├── services/             # 音楽、キャッシュ、FAX等
│   └── server/               # axum HTTP+WS+SSEサーバー
│       ├── router.rs         # ルート定義
│       ├── websocket.rs      # WSハブ
│       ├── sse.rs            # SSEエンドポイント
│       ├── assets.rs         # rust-embed Dual-SPA配信
│       ├── middleware.rs     # CORS, SPAフォールバック除外
│       └── api/              # REST APIハンドラー

crates/
├── overlay-db/               # SQLite DB層 (11テーブル)
├── catprinter/               # プリンター制御 (BLE + USB)
├── twitch-client/            # Twitch OAuth + EventSub + REST API
├── image-processor/          # 画像処理 → 将来 image-engine に拡張
└── word-filter/              # 不適切語フィルタ (20言語)
```

### 2.4 主要な技術選定

| 領域 | Go (現在) | Rust (移行後) |
|------|----------|--------------|
| デスクトップFW | Wails v3 | Tauri 2.x |
| HTTPサーバー | net/http | axum |
| WebSocket | gorilla/websocket | axum::extract::ws |
| SSE | net/http (手動) | axum SSE |
| 非同期 | goroutine | tokio |
| BLE | go-ble | btleplug |
| USB印刷 | os/exec (lpstat/lpr) | std::process::Command |
| SQLite | go-sqlite3 (CGO) | rusqlite |
| ロギング | zap | tracing |
| 画像処理 | golang.org/x/image | image crate |
| テキスト描画 | golang.org/x/image/font | rusttype / ab_glyph |
| 静的ファイル | embed.FS | rust-embed |
| 音楽メタデータ | dhowden/tag | lofty |
| QRコード | go-qrcode | qrcode crate |
| スクリーン管理 | CGO (Cocoa) | tauri::Monitor + cocoa crate |

---

## 3. 現在の実装進捗

### 3.1 完了済み ✅

| 領域 | 進捗 | 備考 |
|------|------|------|
| Tauri 2.x セットアップ | 100% | src-tauri/, tauri.conf.json, Cargo workspace |
| Database層 (overlay-db) | 100% | 11テーブル、マイグレーション、全CRUD |
| 設定・環境変数 | 100% | 29設定項目、DB↔環境変数同期 |
| WebSocket基盤 | 100% | ブロードキャスト、双方向通信 |
| 音楽機能 | 100% | トラック管理、プレイリスト、再生制御 |
| チャット/リワード | 100% | メッセージ取得、カウント/グループ管理 |
| キャッシュ管理 | 100% | 統計、クリーンアップ |
| FAX管理 | 100% | 取得、カラー/モノクロ |
| ワードフィルター | 100% | 23言語対応、CRUD |
| フォント管理 | 100% | アップロード、削除、データ取得 |
| 起動モード分離 | 100% | `task dev`=ヘッドレス, `task dev:tauri`=ウィンドウ |
| Tauri Commands | 部分 | get_server_port, get_version のみ |
| twitch-client crate | 構造のみ | auth/api/eventsub/emotes の骨格あり |
| catprinter crate | 構造のみ | protocol/ble/keepalive の骨格あり |

### 3.2 未実装・スタブ ⚠️

| 領域 | 進捗 | 残作業 |
|------|------|--------|
| Printer API | 55% | scan/test/status/reconnect/system-printers を実装。test-print非DryRunの実印刷が未完 |
| Twitch API | 85% | EventSub連携・一部エラーケース整備を残して主要APIは実装済み |
| Logs API | 75% | tracing subscriber連携済み。SSEとデバッグ連携の拡張を残す |
| OAuth | 80% | `/auth`/`/callback`実装済み（state検証や強化は継続） |
| EventSub | 0% | 11種イベントの購読・ハンドラー全て未実装 |
| 通知システム | 0% | マルチウィンドウ、キュー、フラグメント (850行相当) |
| 印刷オーケストレーション | 0% | ジョブキュー、定時処理、Dry-Run制御 (578行相当) |
| 画像生成エンジン拡張 | 20% | テキスト描画、メッセージ画像、時計画像等 (1,824行相当) |
| ウィンドウ管理 | 0% | マルチモニター、位置永続化、CGO代替 |
| Tauri Emitイベント | 0% | 14種の実装 |
| ヘッドレスモード | 0% | Tauri依存なし軽量バイナリ |
| 起動時初期化統合 | 部分 | 16ステップ中、DB/設定/WF は完了。EventSub/プリンター/通知は未実装 |

### 3.3 既知の問題

- 未実装APIでもSPAフォールバックにより `index.html` を `200` で返す → JSONパース失敗に見える
  - 対策実装: `src-tauri/src/server/assets.rs` で `/api`, `/auth`, `/callback`, `/debug`, `/ws`, `/fax` をSPAフォールバック対象外に変更
- `/api/present/*` が Tauri側で `/api/lottery*` に変更され互換なし
- `/api/music/state/get` → `/api/music/state` の互換性不一致
- OAuthの `redirect_uri` は動的化済み（`auth_status`/`/auth`ともにサーバーポート追従）
- APIギャップが増えると切り分けが遅くなるため、`frontend/`・`web/` の実呼び出し一覧を自動生成して固定化が必要

---

## 4. 残作業フェーズ

### Phase A: 検証基盤 + 互換修正（1日）

- [x] APIスモークテストスクリプト作成（主要エンドポイントのHTTPコード/JSON検証）
- [x] `frontend/`・`web/` が呼ぶAPI一覧を自動抽出し、互換マトリクスを固定化（`scripts/extract_api_inventory.sh`, `docs/TAURI_API_CALLS.md`）
- [x] 未実装APIは `501 JSON` を返すルール統一（未配線ルートの明示化を優先して段階適用）
- [x] SPAフォールバック除外: `/api`, `/auth`, `/callback`, `/debug`, `/ws`, `/fax`
- [x] `/api/present/*` 互換復元（最低限の互換ハンドラを実装）
- [x] `/api/music/state/get` → `/api/music/state` 互換
- [x] `/api/settings`（GET）復元
- [x] `/api/settings/font/file` → `/api/font/data` 互換
- [x] `/api/chat/history` 互換を追加
- [x] `/api/logs/stream`, `/api/logs/download` の互換ルートを追加
- [x] `/debug/clock` 互換を復元
- [x] `task` からAPIスモーク実行可能化（`task smoke:api`）

**完了条件**: フロントで404/HTML誤返却が発生しない

### Phase B: OAuth / Twitch復旧（1-2日）

- [x] `/auth` 追加（Twitch認証URLへリダイレクト）
- [x] `/callback` 追加（コード交換・トークン保存を実装済み）
- [x] `/api/twitch/refresh-token` 実装
- [x] `/api/stream/status` 実データ化（Helix API連携）
- [x] `/api/twitch/custom-rewards` CRUD復旧（GET/POST/PUT/PATCH/DELETE）
- [x] APIアクセス時のトークン自動リフレッシュ（30分前更新）を実装
- [x] `redirect_uri` を動的ポート/実ホストに合わせる（auth_statusの固定ポート30303を修正）

**完了条件**: 設定画面からTwitch認証→カスタムリワード操作まで成功

### Phase C: EventSub実装（2-3日）

- [ ] twitch-client crate の eventsub.rs を統合
- [ ] 全11種イベントのハンドラー実装:
  1. ChannelPointsCustomRewardRedemptionAdd
  2. ChannelCheer
  3. ChannelFollow
  4. ChannelRaid
  5. ChannelChatMessage
  6. ChannelShoutoutReceive
  7. ChannelSubscribe
  8. ChannelSubscriptionGift
  9. ChannelSubscriptionMessage
  10. StreamOffline
  11. StreamOnline
- [ ] 接続監視（30秒間隔ヘルスチェック）
- [ ] リワードキュー（1000バッファ、順次処理）

**完了条件**: Twitchイベント受信→WebSocketブロードキャスト→オーバーレイ表示

### Phase D: Printer復旧（2-3日）

- [x] catprinter crate と API統合（scan/test/status/reconnect の接続系）
- [x] USBプリンター: `/api/printer/system-printers` 実装（`lpstat -p`）
- [x] `DRY_RUN_MODE=true` で `test-print` が安全に成功すること
- [x] KeepAlive（Level 1: 再利用優先、Level 2: エラー時再生成）を reconnect 経路へ適用
- [ ] 非DryRun時の `test-print` 実印刷（画像生成→送信）

**完了条件**: 設定画面のプリンター操作がすべて動作

### Phase E: 画像生成エンジン拡張（3-4日）

image-processor → image-engine スコープ拡張（現在 dither/resize/rotate のみ）:

- [ ] テキストレンダリング (カスタムフォント、折り返し、中央揃え)
- [ ] MessageToImage (フラグメント/Emote/改行対応)
- [ ] MessageToImageWithTitle (アバター付きレイアウト)
- [ ] 時刻画像 (Simple / WithStats / WithStatsColor)
- [ ] QRコード生成
- [ ] Emoteグリッド表示 (最大8セル)
- [ ] 画像合成パイプライン (レイヤリング)
- [ ] Emote/アバターダウンロード+キャッシュ
- [ ] フォントプレビュー生成

**完了条件**: 全画像生成パターンがGoと同等出力

### Phase F: 印刷オーケストレーション（1-2日）

Phase D + E に依存:

- [ ] 印刷ジョブキュー (tokio mpsc, cap=1000)
- [ ] 印刷ワーカータスク (connect→print→disconnect, 失敗時5秒リトライ)
- [ ] 定時処理: clockRoutine (毎正時にPrintClock)
- [ ] 定時処理: keepAliveRoutine
- [ ] Dry-Run二重制御 (DRY_RUN_MODE + AUTO_DRY_RUN_WHEN_OFFLINE + Force)
- [ ] FaxManager保存 → SSEブロードキャスト

**完了条件**: チャットメッセージ→画像生成→印刷キュー→プリンター出力

### Phase G: Present/Overlay整合（1日）

- [ ] Go版エンドポイントとの互換:
  - `/api/present/test`
  - `/api/present/participants` (GET: 一覧, POST: 追加)
  - `/api/present/participants/{id}` (DELETE: 削除)
  - `/api/present/start`
  - `/api/present/stop`
  - `/api/present/clear`
  - `/api/present/lock`
  - `/api/present/unlock`
  - `/api/present/refresh-subscribers`
- [ ] Twitchチャンネルポイント連携 (ロック/アンロック同期)
- [ ] WebSocketリアルタイム抽選演出
- [ ] `/overlay/present` 表示系の動作確認

**完了条件**: 抽選フローがWails版相当で動く

### Phase H: 通知システム（2-3日）

- [ ] 通知キュー (tokio mpsc, バッファ100)
- [ ] ChatNotification (Emoji/Emoteフラグメント対応)
- [ ] マルチウィンドウ通知表示 (tauri::WebviewWindow)
- [ ] 2つの表示モード: queue（順次）/ overwrite（即時上書き）
- [ ] ウィンドウ位置管理 (DB永続化、スクリーンインデックス)
- [ ] Tauri Monitor API でスクリーン情報取得

**完了条件**: チャットメッセージ→通知ポップアップ表示

### Phase I: ウィンドウ管理 + Emitイベント（1-2日）

- [ ] マルチモニター対応 (Tauri Monitor API で CGO 9関数を代替)
- [ ] ウィンドウ位置永続化・復元
- [ ] ウィンドウイベント (移動/リサイズ→位置保存、フルスクリーン)
- [ ] 14種 Tauri Emitイベント実装 (`AppHandle::emit()`)
- [ ] フロントエンド側 listener 追加
- [ ] macOS固有処理 (UIステートクリーンアップ、BLE安全機構)

**完了条件**: ウィンドウ位置が再起動後も復元される

### Phase J: ログ + デバッグ + SSE（1日）

- [x] `/api/logs/stream` (WebSocket) — tracing subscriber連携
- [x] `/api/logs/download` (JSON/TEXT形式)
- [ ] SSE: `GET /api/settings/overlay/events`
- [ ] 13個のデバッグエンドポイント (DEBUG_MODE=true時のみ)
- [ ] `/api/debug/printer-status`

**完了条件**: ログストリーミング+デバッグイベント送信が動作

### Phase K: 起動時初期化統合（1日）

16ステップの順序依存初期化:

```
 1. tracing初期化                          ← ✅ 済
 2. データディレクトリ確保 (tauri::path)      ← ✅ 済
 3. rusqlite DB初期化                       ← ✅ 済
 4. ワードフィルターシーディング              ← ✅ 済
 5. 環境変数/設定読み込み                    ← ✅ 済
 6. 抽選参加者DB読み込み                     ← ⚠️ Phase G依存
 7. フォントマネージャー初期化                ← ✅ 済
 8. 画像キャッシュ初期化 (50MB制限)           ← ✅ 済
 9. 音楽DB初期化                            ← ✅ 済
10. プリンター初期化 + KeepAliveタスク        ← ⚠️ Phase D依存
11. 配信状態取得                            ← ⚠️ Phase B依存
12. Twitchトークン取得/リフレッシュ           ← ⚠️ Phase B依存
13. EventSub WebSocket接続開始              ← ⚠️ Phase C依存
14. 通知システム初期化                       ← ⚠️ Phase H依存
15. axum Webサーバー起動                    ← ✅ 済
16. トークン自動リフレッシュタスク開始         ← ⚠️ Phase B依存
```

**完了条件**: 起動後の自動復元・自動監視がWails版相当

### Phase L: ヘッドレスモード + 仕上げ（1-2日）

- [ ] cmd/server/ 相当のヘッドレスバイナリ (Tauri依存なし)
- [ ] ドキュメント更新（README/Taskfile説明をTauri運用に統一）
- [ ] 不要互換コードの整理
- [ ] 回帰テスト実施

**完了条件**: 新規参加者がドキュメントだけで開発/検証できる

---

## 5. フェーズ依存関係と並列実行

```
Phase A (互換修正) ──→ Phase B (OAuth/Twitch) ──→ Phase C (EventSub)
                                                       ↓
Phase D (Printer) ──┐                            Phase G (Present)
Phase E (Image)  ───┤                            Phase H (通知)
                    ↓                                  ↓
              Phase F (Print Orch.)              Phase I (Window/Emit)
                                                       ↓
Phase J (Logs/Debug/SSE)                         Phase K (初期化統合)
                    ↓                                  ↓
                         Phase L (仕上げ)
```

**並列可能な組み合わせ**:
- B + D + E（OAuth、プリンター、画像は独立）
- C + G + H（EventSub完了後のPresent、通知は並列可）
- J は他と並列可能

---

## 6. リファレンス: APIエンドポイント完全一覧

### 設定系 (10)
| Method | Path | 状態 |
|--------|------|------|
| GET | `/status` | ✅ |
| GET | `/api/settings` | ✅ (互換) |
| GET | `/api/settings/v2` | ✅ |
| PUT | `/api/settings/v2` | ✅ |
| GET | `/api/settings/overlay` | ✅ |
| POST | `/api/settings/overlay` | ✅ |
| GET | `/api/settings/overlay/events` | ⚠️ SSE未実装 |
| POST | `/api/overlay/refresh` | ✅ |
| GET | `/api/settings/status` | ✅ |

### フォント系 (5)
| Method | Path | 状態 |
|--------|------|------|
| POST | `/api/settings/font` | ✅ |
| DELETE | `/api/settings/font` | ✅ |
| GET | `/api/settings/font/file` | ✅ (互換) |
| GET | `/api/font/data` | ✅ |
| POST | `/api/settings/font/preview` | ⚠️ 501（未実装を明示） |

### Twitch/認証系 (8)
| Method | Path | 状態 |
|--------|------|------|
| GET | `/auth` | ✅ |
| GET | `/callback` | ✅ |
| POST | `/api/twitch/refresh-token` | ✅ |
| GET | `/api/twitch/custom-rewards` | ✅ |
| POST | `/api/twitch/custom-rewards` | ✅ |
| PUT | `/api/twitch/custom-rewards/{id}` | ✅ |
| DELETE | `/api/twitch/custom-rewards/{id}` | ✅ |
| GET | `/api/stream/status` | ✅ |

### プリンター系 (6)
| Method | Path | 状態 |
|--------|------|------|
| POST | `/api/printer/scan` | ✅（BLE環境依存で500あり） |
| POST | `/api/printer/test` | ✅（BLE/USBの存在確認） |
| POST | `/api/printer/test-print` | 部分（Dry-Runのみ200） |
| GET | `/api/printer/status` | ✅ |
| POST | `/api/printer/reconnect` | ✅（BLE環境依存で500あり） |
| GET | `/api/printer/system-printers` | ✅（CUPS環境依存で500あり） |

### 音楽系 (9)
| Method | Path | 状態 |
|--------|------|------|
| GET | `/api/music/playlists` | ✅ |
| POST | `/api/music/playlists` | ✅ |
| DELETE | `/api/music/playlists/{id}` | ✅ |
| POST | `/api/music/track/upload` | ✅ |
| DELETE | `/api/music/track/{id}` | ✅ |
| DELETE | `/api/music/track/all` | ✅ |
| GET | `/api/music/track/{id}/audio` | ✅ (Range対応) |
| GET | `/api/music/state` | ✅ |
| POST | `/api/music/control` | ✅ |

### プレゼント抽選系 (9)
| Method | Path | 状態 |
|--------|------|------|
| POST | `/api/present/test` | ✅ |
| GET | `/api/present/participants` | ✅ |
| POST | `/api/present/participants` | ✅ |
| DELETE | `/api/present/participants/{id}` | ✅ |
| POST | `/api/present/start` | ✅ |
| POST | `/api/present/stop` | ✅ |
| POST | `/api/present/clear` | ✅ |
| POST | `/api/present/lock` | ✅ |
| POST | `/api/present/unlock` | ✅ |

### リワード系 (7)
| Method | Path | 状態 |
|--------|------|------|
| GET | `/api/twitch/reward-groups` | ✅ |
| POST | `/api/twitch/reward-groups` | ✅ |
| PUT | `/api/twitch/reward-groups/{id}` | ✅ |
| DELETE | `/api/twitch/reward-groups/{id}` | ✅ |
| POST | `/api/twitch/reward-groups/{id}/toggle` | ✅ |
| GET | `/api/twitch/reward-counts` | ✅ |
| POST | `/api/twitch/reward-counts/reset` | ✅ |

### その他 (11)
| Method | Path | 状態 |
|--------|------|------|
| GET | `/ws` | ✅ |
| GET | `/api/logs/stream` | ✅ |
| GET | `/api/logs/download` | ✅ |
| GET | `/api/chat/history` | ✅ |
| GET | `/api/cache/stats` | ✅ |
| DELETE | `/api/cache/clear` | ✅ |
| GET | `/api/word-filter` | ✅ |
| POST | `/api/word-filter` | ✅ |
| DELETE | `/api/word-filter/{id}` | ✅ |
| GET | `/api/word-filter/languages` | ✅ |
| GET | `/fax/{id}/{type}` | ✅ |

### デバッグ系 (13, DEBUG_MODE=true時のみ)
| Method | Path | 状態 |
|--------|------|------|
| POST | `/debug/fax` | 部分 |
| POST | `/debug/channel-points` | 部分 |
| POST | `/debug/clock` | 部分 |
| POST | `/debug/follow` | 部分 |
| POST | `/debug/cheer` | 部分 |
| POST | `/debug/subscribe` | 部分 |
| POST | `/debug/gift-sub` | 部分 |
| POST | `/debug/resub` | 部分 |
| POST | `/debug/raid` | 部分 |
| POST | `/debug/shoutout` | 部分 |
| POST | `/debug/stream-online` | 部分 |
| POST | `/debug/stream-offline` | 部分 |
| GET | `/api/debug/printer-status` | 部分 |

---

## 7. リファレンス: WebSocketメッセージタイプ (9+)

| タイプ | 方向 | 用途 |
|--------|------|------|
| `music_status_update` | S→C | 再生状態更新 |
| `music_control_command` | S→C | 再生制御コマンド |
| `fax_received` | S→C | FAX受信通知 |
| `eventsub_event` | S→C | Twitchイベント通知 |
| `settings` | S→C | 設定変更通知 |
| `stream_status_changed` | S→C | 配信状態変更 |
| `font_updated` | S→C | フォント更新通知 |
| `mic_transcript` | S→C | マイク文字起こし |
| `mic_transcript_translation` | S→C | 翻訳結果 |
| `connected` | S→C | 接続確認 (clientID付与) |
| `ping` / `pong` | 双方向 | ハートビート |

補足（2026-02-12）:
- `/api/logs/stream` は tracing subscriber のイベントをWebSocketへリアルタイム配信
- `/api/logs/download` は JSON/TEXT でリングバッファ内容を出力

### WebSocket実装パラメータ

| パラメータ | 値 |
|-----------|---|
| ブロードキャストバッファ | 2048 |
| クライアント送信バッファ | 256 |
| Pingインターバル | 30秒 |
| 読み取りデッドライン | 120秒 |
| リトライ | 指数バックオフ |

---

## 8. リファレンス: Wails Emitイベント → Tauri emit (14種)

| イベント名 | 用途 | 実装状態 |
|-----------|------|---------|
| `stream_status_changed` | 配信開始/終了 | ⚠️ |
| `printer_connected` | プリンター接続/切断 | ⚠️ |
| `printer_error` | プリンター操作失敗 | ⚠️ |
| `print_error` | 印刷失敗 | ⚠️ |
| `print_success` | 印刷成功 | ⚠️ |
| `webserver_started` | サーバー起動完了 | ⚠️ |
| `webserver_error` | サーバー起動失敗 | ⚠️ |
| `auth_success` | OAuth完了 | ⚠️ |
| `settings_updated` | 設定変更 | ⚠️ |
| `music_status_update` | 再生状態変更 | ⚠️ |
| `music_control_command` | 再生制御 | ⚠️ |
| `fax_received` | FAX受信 | ⚠️ |
| `eventsub_event` | Twitchイベント | ⚠️ |
| `save_window_position` | ウインドウ移動 | ⚠️ |

---

## 9. リファレンス: EventSub購読イベント (11種)

| イベントタイプ | ハンドラー | 実装状態 |
|---------------|-----------|---------|
| ChannelPointsCustomRewardRedemptionAdd | HandleChannelPointsCustomRedemptionAdd | ⚠️ |
| ChannelCheer | HandleChannelCheer | ⚠️ |
| ChannelFollow | HandleChannelFollow | ⚠️ |
| ChannelRaid | HandleChannelRaid | ⚠️ |
| ChannelChatMessage | HandleChannelChatMessage | ⚠️ |
| ChannelShoutoutReceive | HandleChannelShoutoutReceive | ⚠️ |
| ChannelSubscribe | HandleChannelSubscribe | ⚠️ |
| ChannelSubscriptionGift | HandleChannelSubscriptionGift | ⚠️ |
| ChannelSubscriptionMessage | HandleChannelSubscriptionMessage | ⚠️ |
| StreamOffline | HandleStreamOffline | ⚠️ |
| StreamOnline | HandleStreamOnline | ⚠️ |

---

## 10. リファレンス: Go → Rust 対応表

| Go (internal/) | 行数 | Rust | 状態 |
|---|---|---|---|
| `localdb/` | 1,850 | `crates/overlay-db/` | ✅ |
| `env/`, `settings/` | 884 | `src-tauri/src/` + `overlay-db` | ✅ |
| `webserver/server.go` | 1,667 | `src-tauri/src/server/` | 部分 |
| `webserver/websocket.go` | 375 | `src-tauri/src/server/websocket.rs` | ✅ |
| `webserver/present_handler.go` | 968 | `src-tauri/src/server/api/present.rs` | 部分（互換ルート追加済み） |
| `webserver/overlay_settings_api.go` | 984 | `src-tauri/src/server/api/overlay.rs` | 部分(SSE未) |
| `webserver/reward_groups_api.go` | 492 | `src-tauri/src/server/api/reward.rs` | ✅ |
| `webserver/reward_counts_api.go` | 273 | `src-tauri/src/server/api/reward.rs` | ✅ |
| `webserver/logs_api.go` | 249 | `src-tauri/src/server/api/logs.rs` | 部分（WS/ダウンロード雛形） |
| `output/image.go` | 1,824 | `crates/image-processor/` | 20% |
| `output/printout.go` | 578 | `src-tauri/src/print/` | ⚠️ 未実装 |
| `output/bluetooth_client.go` | 310 | `crates/catprinter/ble.rs` | 構造のみ |
| `output/usb_printer.go` | 201 | `crates/catprinter/usb.rs` | ⚠️ 未実装 |
| `output/bluetooth_safety.go` | 48 | `crates/catprinter/` | ⚠️ 未実装 |
| `notification/` | 850 | `src-tauri/src/notification/` | ⚠️ 未実装 |
| `twitcheventsub/` | 468 | `crates/twitch-client/eventsub.rs` | 構造のみ |
| `twitchapi/` | - | `crates/twitch-client/api.rs` | 構造のみ |
| `twitchtoken/` | - | `crates/twitch-client/auth.rs` | 構造のみ |
| `music/` | - | `src-tauri/src/services/music.rs` | ✅ |
| `wordfilter/` | - | `crates/word-filter/` | ✅ |
| `cache/` | 583 | `src-tauri/src/services/cache.rs` | ✅ |
| `fontmanager/` | - | `src-tauri/src/services/font.rs` | ✅ |
| `faxmanager/` | - | `src-tauri/src/services/fax.rs` | ✅ |
| `status/` | - | `src-tauri/src/services/status.rs` | ✅ |
| `app.go` | 2,100 | `src-tauri/src/` | 30% |
| `window_darwin.go` (CGO) | - | `src-tauri/src/window/` | ⚠️ 未実装 |
| `cmd/server/` | 482 | 未定 | ⚠️ 未実装 |
| `version/` | 24 | `src-tauri/src/` | ✅ |

---

## 11. テスト計画

実行時は必ず `DRY_RUN_MODE=true` を付与。

```bash
# Rust単体テスト
DRY_RUN_MODE=true cargo test -p cairo-overlay

# フロントビルド
cd frontend && bun run build
cd web && bun run build

# 開発起動
DRY_RUN_MODE=true task dev

# APIスモーク
DRY_RUN_MODE=true task smoke:api

# 動作確認URL
Dashboard: http://localhost:<port>/
Overlay:   http://localhost:<port>/overlay/
Present:   http://localhost:<port>/overlay/present
```

### 実機テスト項目（人間が実行）

- [ ] BLEプリンター接続・印刷（GB + MXW01）
- [ ] USBプリンター接続・印刷
- [ ] Twitch OAuth フロー
- [ ] EventSub 11種イベント受信
- [ ] OBS オーバーレイ表示
- [ ] WebSocket 9+メッセージタイプ
- [ ] SSE オーバーレイ設定更新
- [ ] 音楽プレイヤー + Range対応ストリーミング
- [ ] KeepAlive安定性
- [ ] 通知マルチウィンドウ (queue/overwrite)
- [ ] プレゼント抽選フロー
- [ ] マルチモニター (ウィンドウ位置復元)
- [ ] 13デバッグエンドポイント
- [ ] Dry-Run二重制御

---

## 12. リスクと対策

| リスク | 対策 |
|--------|------|
| btleplug macOS UUID不整合 | go-catprinterと同じワークアラウンド（af30フォールバック） |
| BLE実機テスト必須 | Phase D完了後に人間が実施 |
| USBプリンター (CUPS) 互換 | lpstat/lprの出力パースをテスト |
| Twitch EventSubライブラリ不在 | tokio-tungsteniteで自前実装 |
| Go並行→tokio移行 | goroutine→tokio::spawn, channel→mpsc/broadcast |
| image.goの複雑さ (1,824行) | image-engineとして段階的拡張 |
| 通知マルチウィンドウ (CGO依存) | Tauri WebviewWindow + Monitor API |
| 初期化順序の依存関係 | 16ステップを明示的にテスト |
| SPAフォールバック誤爆 | APIプレフィックスを先に除外するミドルウェア |
| 互換ルート増加で複雑化 | 互換層をモジュール分離、将来削除可能に |

---

## 13. 優先度

- **P0**: OAuth, SPAフォールバック修正, `/api/present/*` 互換
- **P1**: EventSub, Printer実処理, 起動時処理復旧
- **P2**: 画像エンジン拡張, 通知システム, ウィンドウ管理
- **P3**: ヘッドレスモード, デバッグAPI, ドキュメント

---

## 14. 完了判定（Definition of Done）

- [ ] `task dev` でヘッドレス起動し、ブラウザからDashboard/Overlay利用可能
- [ ] 既存フロントから参照される全APIがJSONで期待通り応答
- [ ] Twitch認証・リワード連携が実動
- [ ] EventSub 11種イベントが受信・処理される
- [ ] プリンター機能が `DRY_RUN_MODE` と実機モードで成立
- [ ] 画像生成がGo版と同等出力
- [ ] Present抽選機能が実動
- [ ] 通知マルチウィンドウが動作
- [ ] ウィンドウ位置が再起動後も復元される
- [ ] 起動時自動処理（EventSub/トークン/初期化）が復旧
- [ ] 13デバッグエンドポイントが動作
- [ ] ドキュメント更新完了
