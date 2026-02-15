---
title: "PRマージタスク"
read_only: false
type: "command"
argument-hint: "[pr-number]"
---

# PRマージ（/m）

## 短縮コマンド宣言

- `/m` は `/merge` の短縮コマンド。
- 挙動・判断基準は `.claude/commands/merge.md` に準拠する。

## 目的

対象PRを安全確認のうえ、`scripts/ghx pr merge` でマージする。

## 実行ルール

- 対象PRは `引数 > issue_scopeのpr_number > 現在ブランチPR > issue_scope由来PR` の順で解決する。
- 事前確認（Draft/mergeable/レビュー/チェック）に通過した場合のみ実行する。
- Issue連携中は、結果を `primary_issue`（必要に応じて `related_issues`）へコメント追記する。
