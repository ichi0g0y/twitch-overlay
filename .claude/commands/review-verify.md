---
title: "レビュー検証タスク"
read_only: false
type: "command"
argument-hint: "[issue-number]"
---

# レビュー検証（/review-verify）

## 目的

対象Issueのレビューコメントを基準に、指摘の妥当性を検証し、採用した指摘のみ修正・テストする。

## 実行手順

1. 引数のIssue番号を確認する（例: `/review-verify 9`）。
2. 引数が未指定の場合は `.context/issue_scope.json` を確認する。
3. 引数も `.context/issue_scope.json` も未指定の場合:
   - Issue連携を使わず通常動作で進める。
   - ユーザーが指示したレビュー指摘のみを対象に検証・修正する。
   - 最終報告のみ行い、Issueコメント追記は行わない。
4. 引数または `.context/issue_scope.json` からIssueが決定できた場合:
   - Issue本文・コメント確認 で Issue本文と最新コメントを取得する。
   - `primary_issue` と `related_issues` のレビューコメントを収集する。
   - 各指摘を **採用 / 不採用 / 追加情報必要** で分類して妥当性を検証する。
   - 採用した指摘のみ修正を実施する。
   - 必要なテストを実行し、失敗したら修正して再実行する。
5. 4でIssueが決定できた場合のみ、`primary_issue` と `related_issues` に修正結果コメントを追記する。以下を必ず含める。
   - 対象Issue番号
   - 指摘ごとの判定（採用 / 不採用 / 追加情報必要）
   - 実施した修正内容
   - テスト結果
6. 最終報告は日本語で行う。

## ルール

- レビュー内容は鵜呑みにせず、必ず自分で妥当性を検証する。
- 修正対象は採用した指摘のみとする。
- Issueコメントの取得・追記に `GitHub CLI` を使う場合は標準の実行方式を使う。
- `/commit` / `/c` または `/commit!` / `/c!` の明示的指示がない限りコミットしない。
