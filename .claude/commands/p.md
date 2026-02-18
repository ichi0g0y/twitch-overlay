---
title: "Issueスコープ固定タスク"
read_only: false
type: "command"
argument-hint: "[primary-issue-number] [related-issue-number ...]"
---

# Issueスコープ固定（/p）

## 短縮コマンド宣言

- `/p` は `/pick` の短縮コマンド。
- 挙動・判断基準は `.claude/commands/pick.md` に準拠する。

## 目的

対象Issueを `.context/issue_scope.json` に保存し、修正者・レビュアー・PR作成時で共通参照できるようにする。

## 実行ルール

- 詳細仕様は `.ai/workflow.md` の「Issueスコープ管理（標準）」に従う。
- 実処理は必ず `scripts/pick_issue_scope.sh` を使い、`/pick` と完全に同じ選定ロジックを使う。
- 既存の `.context/issue_scope.json` がある場合は、`上書き / relatedに追加 / 取消` を確認する。
- `relatedに追加` を選んだ場合は、既存 `primary_issue` を維持し、追加対象Issueを `related_issues` と `active_related_issues` に登録して継続する（新規stateは `reserved`）。
- `schema_version: 2` の形式で `primary_issue` / `related_issues` / `active_related_issues` / `branch` / `picked_at` を更新する。
- 更新後は `primary` / `issue概要` / `related` / `active_related` / `branch` / `selection_reason` を明示して報告する。

## 注意

- `/p` は任意コマンド。未実行でも通常動作は可能。
- 既存スコープがある場合、ユーザー確認なしで上書きしない。
