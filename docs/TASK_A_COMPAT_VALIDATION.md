# TASK A: 検証基盤 + 互換修正

- 優先度: **P0**
- 見積: 1日
- 依存: なし（最初に着手）
- ブロック: Phase B, G

---

## 目的

フロントエンドが現状のTauri APIに対して404やHTML誤返却を受ける問題を解消し、以後の開発の検証基盤を整備する。

---

## 背景

- 未実装APIでもSPAフォールバックにより `index.html` を `200` で返す
- クライアント側で「HTTPエラーではなくJSONパース失敗」に見えるため切り分け困難
- `/api/present/*` が Tauri側で `/api/lottery*` に変更され互換なし
- `/api/music/state/get` と `/api/music/state` の不一致

---

## タスク

### A-1. SPAフォールバック除外ミドルウェア

**変更対象**: `src-tauri/src/server/assets.rs` または `middleware.rs`

以下のプレフィックスはSPAフォールバック対象外にする:
- `/api`
- `/auth`
- `/callback`
- `/debug`
- `/ws`
- `/fax`

これらのパスでルートが見つからない場合は `404 JSON` を返す:
```json
{"error": "Not Found", "path": "/api/..."}
```

**参考**: Go版 `internal/webserver/server.go` のルーティング順序

### A-2. 未実装API 501レスポンス統一

未実装だがルート登録済みのAPIは `501 Not Implemented` を返す:
```json
{"error": "Not Implemented", "path": "/api/..."}
```

**対象**: printer系5エンドポイント、twitch系2エンドポイント、logs系2エンドポイント

### A-3. `/api/present/*` 互換復元

**変更対象**: `src-tauri/src/server/router.rs`

Go版のエンドポイント（`internal/webserver/present_handler.go:284-294`）に合わせる:
- `/api/present/test`
- `/api/present/participants` (GET/POST)
- `/api/present/participants/{id}` (DELETE)
- `/api/present/start`
- `/api/present/stop`
- `/api/present/clear`
- `/api/present/lock`
- `/api/present/unlock`
- `/api/present/refresh-subscribers`

内部で既存の lottery 実装を呼ぶか、互換ハンドラーを追加。

### A-4. 音楽API互換

**変更対象**: `src-tauri/src/server/router.rs`

- `/api/music/state/get` → `/api/music/state` へのエイリアス追加

### A-5. 設定・フォントAPI互換

**変更対象**: `src-tauri/src/server/router.rs`

- `/api/settings` (GET) を復元
- `/api/settings/font/file` → `/api/font/data` 互換で提供

### A-6. APIスモークテストスクリプト

**新規作成**: `scripts/api_smoke_test.sh` または `tests/api_smoke.rs`

主要20+エンドポイントに対して:
1. HTTPステータスコードが期待値か確認
2. Content-Type が `application/json` か確認
3. レスポンスがJSONとしてパースできるか確認

```bash
# 例
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/settings/v2
# 期待: 200

curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/present/participants
# 期待: 200 or 501 (未実装ならば)

curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/nonexistent
# 期待: 404 (SPAフォールバックではない)
```

Taskfile.yml に `task test:api` として登録。

---

## 完了条件

- [ ] `/api/nonexistent` が `404 JSON` を返す（HTML index.html ではない）
- [ ] 未実装APIが `501 JSON` を返す
- [ ] `/api/present/*` がGo版と同じパスで応答
- [ ] `/api/music/state/get` が動作
- [ ] スモークテストスクリプトが20+エンドポイントを自動検証
- [ ] フロントエンド (frontend/, web/) でJSONパースエラーが発生しない

---

## 参照ファイル

| Go側 | 用途 |
|------|------|
| `internal/webserver/server.go:280-370` | 全ルート登録 |
| `internal/webserver/present_handler.go:284-294` | Present APIルート |
| `internal/webserver/server.go:1550-1667` | SPA配信・フォールバック |
