---
title: "計画・Issue起票タスク"
read_only: false
type: "command"
---

# 計画作成とIssue起票（/plan）

## 目的

実装に入る前に、計画を確定し、承認後に GitHub Issue を自動作成して `.context/issue_scope.json` へ保存する。

## 実行手順

1. 以下をこの順で読み込む。
   - `AI.md`
   - `.ai/behavior.md`
   - `.ai/rules.md`
   - `.ai/workflow.md`
   - `.ai/dev-env.md`
2. `direnv/ghx` の事前確認を行う。
   - `.envrc` がない場合は `bash scripts/setup_envrc.sh` を実行する。
   - `scripts/ghx auth status` を実行し、GitHub操作可能か確認する。
   - 失敗時はそこで停止し、原因と対処を確認する。
3. 要件を分解し、次を含む実行計画を作成して提示する。
   - 目的 / スコープ / 非スコープ
   - 実装手順
   - 受け入れ条件
   - 想定テスト
4. ユーザーに計画承認を確認する。
5. 承認されたら `scripts/ghx issue create` で Issue を作成する。
6. `.context/issue_scope.json` が既にある場合は、上書き前に確認する。
7. 生成した Issue 番号を `.context/issue_scope.json` に保存する。
   - 最低限 `primary_issue` / `related_issues` / `branch` / `picked_at` を記録する。
   - `pr_number` / `pr_url` は未作成状態として空にしておく。
8. 日本語で結果を報告する。
   - 計画の要点
   - 作成した Issue 番号・URL
   - 次に実施する1手（実装着手）

## ルール

- `/plan` では実装・コミット・PRマージを行わない。
- 計画承認前に Issue を作成しない。
- `gh` を直接呼ばず、必ず `scripts/ghx ...` を使う。
- Issue 作成後は `.context/issue_scope.json` の更新を省略しない。
