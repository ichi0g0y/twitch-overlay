---
title: "Issueスコープ固定タスク"
read_only: false
type: "command"
argument-hint: "<primary-issue-number> [related-issue-number ...]"
---

# Issueスコープ固定（/pick）

## 目的

対象Issueを `.context/issue_scope.json` に保存し、修正者・レビュアー・PR作成時で共通参照できるようにする。

## 実行手順

1. 既存の `.context/issue_scope.json` の有無を確認する。
2. 既存ファイルがある場合:
   - 既存スコープがある旨を警告する。
   - `上書き / relatedに追加 / 取消` のいずれで続行するかユーザーに確認する。
3. 引数から `primary_issue` と `related_issues` を決定する。
4. 現在のブランチ名を含めて `.context/issue_scope.json` を更新する。
5. 結果を報告する（primary/related/branch）。

## ルール

- `/pick` は任意コマンド。未実行でも通常動作は可能。
- `/pick` 後は、`.context/issue_scope.json` の `branch` を作業ブランチとして固定し、勝手に変更しない。
- 軽微修正をまとめる場合は複数Issueを `related_issues` に登録してよい。
- 共有ライブラリ変更で複数Issueへ影響する場合は、各Issueコメントに関連Issueを相互記載する。
