# issue-task-a-compat-validation TASK A: 検証基盤 + 互換修正

- 状態: Open
- 優先度: 高
- 担当: 未定
- 期限: 未定

## 概要

旧 `docs/TASK_A_COMPAT_VALIDATION.md` から移植した未完了タスクを、このIssue本文で追跡する。

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

## レビュー観点

- 移植元TASK文書の具体項目が漏れず反映されているか
- 受け入れ条件が検証可能な粒度になっているか
- 1Issue 1PRで進められる分割になっているか

## TODO ID連携

- なし

## 関連ファイル

- `issues/open/issue-task-a-compat-validation/README.md`
- `issues/index.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
