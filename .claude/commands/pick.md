---
title: "Issueスコープ固定タスク"
read_only: false
type: "command"
argument-hint: "[primary-issue-number] [related-issue-number ...]"
---

# Issueスコープ固定（/pick）

## 目的

対象Issueを `.context/issue_scope.json` に保存し、修正者・レビュアー・PR作成時で共通参照できるようにする。

## 実行手順

1. 既存の `.context/issue_scope.json` の有無を確認する。
2. 既存ファイルがある場合:
   - 既存スコープがある旨を警告する。
   - `上書き / relatedに追加 / 取消` のいずれで続行するかユーザーに確認する。
   - `relatedに追加` を選んだ場合は、既存 `primary_issue` を維持し、追加対象Issueを `related_issues` と `active_related_issues` に登録して継続する（新規stateは `reserved`）。
3. `scripts/pick_issue_scope.sh` を使って `primary_issue` と `related_issues` を決定する。
   - 引数あり: 指定Issueを採用する。
   - 引数なし: `priority:P0 -> P1 -> P2 -> P3` の順で Open Issue の最古を採用する。
   - 優先度ラベル付きIssueが無い場合: Open Issue 全体の最古を採用する。
4. `.context/issue_scope.json` を更新する（`schema_version: 2`、`primary_issue` / `related_issues` / `active_related_issues` / `branch` / `picked_at`）。
5. 結果を報告する（primary/issue概要/related/active_related/branch/selection_reason）。

## ルール

- `/pick` は任意コマンド。未実行でも通常動作は可能。
- `/pick` 後は、`.context/issue_scope.json` の `branch` を作業ブランチとして固定し、勝手に変更しない。
- 軽微修正をまとめる場合は複数Issueを `related_issues` に登録してよい。
- 共有ライブラリ変更で複数Issueへ影響する場合は、各Issueコメントに関連Issueを相互記載する。
- 実処理は `scripts/pick_issue_scope.sh` を唯一の更新経路として扱う。
