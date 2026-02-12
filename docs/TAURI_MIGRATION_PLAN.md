# Tauri移行 不足処理対応計画書

- 作成日: 2026-02-12
- 対象ブランチ: `develop`（作業ブランチで実装後に反映）
- 対象: `src-tauri/` を中心とした Wails→Tauri 移行の機能ギャップ解消

## 1. 目的

Tauri版を「Wails版と同等の運用フロー」で安定稼働させる。

- 通常起動はヘッドレス（バックエンドWebサーバー起動）
- ダッシュボードはブラウザ経由でアクセス
- 既存フロントエンド（`frontend/`, `web/`）のAPI契約を崩さない
- Twitch連携・プリンター連携・抽選・ログ・デバッグ機能を実用レベルまで復旧

## 2. 現状整理（要対応）

### 2.1 起動モード

- `task dev` はヘッドレス起動に修正済み
- `task dev:tauri` はウィンドウ付き起動に分離済み
- `tauri.conf.json` は `windows: []` で通常ウィンドウを作らない設定

### 2.2 API/機能ギャップ

以下はフロントが利用しているが、Tauri側で未実装または互換切れ。

- OAuth: `/auth`, `/callback`
- Twitch: `/api/twitch/custom-rewards*`, トークン更新実処理, 配信状態取得
- Printer: `/api/printer/system-printers`、他プリンターAPIの実処理
- Present: `/api/present/*`（現状 `/api/lottery*` へ変更され互換なし）
- Font: `/api/settings`, `/api/settings/font/file`, `/api/settings/font/preview`
- Logs: `/api/logs/stream`, `/api/logs/download`
- Chat: `/api/chat/history`
- Debug: `/debug/clock` ほか一部
- Music: `/api/music/state/get` 互換

### 2.3 挙動上の問題

- 未実装APIでもSPAフォールバックにより `index.html` を `200` で返す場合がある
- クライアント側で「HTTPエラーではなくJSONパース失敗」に見えるため切り分け困難

### 2.4 起動時初期化の差分

Wailsの `Startup()` で実行していた処理（EventSub開始、トークン定期更新、プリンター初期化、抽選初期化など）がTauri側で不足。

## 3. 実装方針

1. **互換優先**
   - 先に「既存フロントがそのまま動く」ための互換ルートを復元
2. **段階的に中身を実装**
   - ルート復元 → スタブ排除 → 起動時処理復旧の順
3. **フォールバック制御**
   - `/api`, `/auth`, `/callback`, `/debug`, `/ws`, `/fax` はSPAフォールバック対象外にする
4. **検証を先に整備**
   - APIスモークテストを追加し、回帰を防ぐ

## 4. フェーズ計画

## Phase 0: 検証基盤整備（0.5日）

- [ ] APIスモークテストスクリプト作成（主要エンドポイントのHTTPコード/JSON検証）
- [ ] 「未実装時は `501 JSON` を返す」最低限ルールを統一
- [ ] `task` から簡単に実行できる確認手順を用意

完了条件:
- 最低20本程度の主要APIを自動確認できる

## Phase 1: 互換ルート復元（1日）

- [ ] `/api/present/*` を復元（内部で既存 `lottery` 実装を呼ぶか、互換ハンドラ追加）
- [ ] `/api/music/state/get` を `/api/music/state` 互換として追加
- [ ] `/api/settings`（GET）を復元
- [ ] `/api/settings/font/file` を `/api/font/data` 互換で提供
- [ ] `/api/chat/history` を既存チャットデータ取得に接続
- [ ] `/api/logs/download` 追加（最低限ファイル出力）
- [ ] `/api/logs/stream` 追加（WebSocket/SSEいずれかを既存UI仕様に合わせる）
- [ ] `/debug/clock` 復元
- [ ] ルーターで APIパスのSPAフォールバック誤爆を防止

完了条件:
- フロントで404/HTML誤返却が発生しない

## Phase 2: OAuth/Twitch復旧（1-2日）

- [ ] `/auth` 追加（Twitch認証URLへリダイレクト）
- [ ] `/callback` 追加（コード交換・トークン保存）
- [ ] `/api/twitch/refresh-token` を実装
- [ ] `/api/stream/status` を実データ化
- [ ] `/api/twitch/custom-rewards`（一覧/更新/削除/作成）復旧
- [ ] `/api/twitch/reward-groups/by-reward` と `/rewards` POST互換を追加

完了条件:
- 設定画面からTwitch認証→カスタムリワード操作まで一連で成功

## Phase 3: Printer復旧（1-2日）

- [ ] `scan/test/status/reconnect/test-print` を実装（`catprinter` / system printer連携）
- [ ] `/api/printer/system-printers` 追加
- [ ] `DRY_RUN_MODE=true` で安全にテストできることを確認
- [ ] KeepAlive運用方針（インスタンス再利用優先 + エラー時再生成）を反映

完了条件:
- 設定画面のプリンター操作がすべて期待通りに動作

## Phase 4: Present/Overlay整合（1日）

- [ ] `web/` が期待するイベント名・レスポンス形式に完全一致
- [ ] 参加者追加/削除/ロック/開始停止/サブスク更新の動作確認
- [ ] `/overlay/present` 表示系の動作確認

完了条件:
- プレゼント抽選フローがWails版相当で動く

## Phase 5: 起動時処理復旧（1日）

- [ ] Tauri起動時に必要な初期化を統合（DB, word filter seed, music DB, cache等）
- [ ] EventSub開始・トークン更新goroutine相当を移植
- [ ] プリンター初回接続・状態通知の復旧

完了条件:
- アプリ起動後の自動復元・自動監視がWails版相当に到達

## Phase 6: 仕上げ（0.5-1日）

- [ ] ドキュメント更新（README/Taskfile説明をTauri運用に統一）
- [ ] 不要互換コードの整理（必要なものは残す）
- [ ] 回帰テスト実施

完了条件:
- 新規参加者がドキュメントだけで開発/検証できる

## 5. 優先度

- P0: OAuth, Printer実処理, `/api/present/*` 互換, SPAフォールバック誤爆修正
- P1: Custom rewards系, logs/chat/font互換, 起動時処理復旧
- P2: 追加デバッグAPI、内部リファクタリング、テスト拡充

## 6. テスト計画

実行時は必ず `DRY_RUN_MODE=true` を付与。

- Rust単体:
  - `DRY_RUN_MODE=true cargo test -p cairo-overlay`
- APIスモーク:
  - `DRY_RUN_MODE=true task dev` 起動後に主要API確認
- フロントビルド:
  - `cd frontend && bun run build`
  - `cd web && bun run build`
- 動作確認:
  - Dashboard: `http://localhost:<port>/`
  - Overlay: `http://localhost:<port>/overlay/`
  - Present: `http://localhost:<port>/overlay/present`

## 7. リスクと対策

- Twitch APIレート/認証失敗
  - 対策: リトライと明確なエラーレスポンス、ログ強化
- BLE接続不安定
  - 対策: KeepAliveの2段階戦略（再利用優先→再生成）
- 互換ルート増加で複雑化
  - 対策: 互換層をモジュール分離、将来削除可能に管理
- SPAフォールバック誤爆の再発
  - 対策: ルーターでAPIプレフィックスを先に除外しテストで固定化

## 8. 成果物

- 実装コード（`src-tauri/src/server/*`, `src-tauri/src/services/*`）
- 互換API一覧ドキュメント
- APIスモークテスト手順（またはスクリプト）
- 最終チェックリスト

## 9. 完了判定（Definition of Done）

- [ ] `task dev` でヘッドレス起動し、ブラウザからDashboard/Overlay利用可能
- [ ] 既存フロントから参照される主要APIがJSONで期待通り応答
- [ ] Twitch認証・リワード連携が実動
- [ ] プリンター機能が `DRY_RUN_MODE` と実機モードで成立
- [ ] Present抽選機能が実動
- [ ] 起動時自動処理（EventSub/トークン/初期化）が復旧
- [ ] ドキュメント更新完了

