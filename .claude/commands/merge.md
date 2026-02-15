---
title: "PRマージタスク"
read_only: false
type: "command"
argument-hint: "[pr-number]"
---

# PRマージ（/merge）

## 目的

対象PRを安全確認のうえ `scripts/ghx pr merge` でマージし、Issue連携時は結果をIssueコメントへ記録する。

## 実行手順

1. マージ対象PRを次の優先順位で解決する。
   - 引数のPR番号（例: `/merge 123`）
   - `.context/issue_scope.json` の `pr_number`
   - 現在ブランチに紐づくPR（`scripts/ghx pr view --json number,url`）
   - `.context/issue_scope.json` の `primary_issue` に紐づくPR
2. 対象PRを解決できない場合は、実行せずに停止してユーザーへ確認する。
3. `scripts/ghx pr view <pr-number> --json number,url,state,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup` で事前確認する。
4. 次の条件を満たす場合のみマージする。
   - `state` が `OPEN`
   - `isDraft` が `false`
   - `mergeStateStatus` がマージ可能状態
   - 必須レビュー/必須チェックに未完了がない
5. マージを実行する。
   - 既定: `scripts/ghx pr merge <pr-number> --squash --delete-branch`
6. `.context/issue_scope.json` がある場合は `primary_issue`（必要に応じて `related_issues`）へ結果コメントを追記する。
   - 成功時: PR番号・URL・方式・実行時刻
   - 失敗時: 失敗したチェック内容・エラーメッセージ

## ルール

- `gh` を直接呼ばず、必ず `scripts/ghx ...` を使う。
- 事前確認で不整合があればマージしない。
- `/commit` 系の明示がない限り、コミットは行わない。
