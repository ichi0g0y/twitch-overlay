---
title: "レビュー検証タスク"
read_only: false
type: "command"
argument-hint: "[issue-number]"
---

# レビュー検証（/rv）

## 短縮コマンド宣言

- `/rv` は `/review-verify` の短縮コマンド。
- 挙動・判断基準は `.claude/commands/review-verify.md` に準拠する。

## 目的

対象Issueのレビューコメントを基準に、指摘の妥当性を検証し、採用した指摘のみ修正・テストする。

## 実行ルール

- 詳細仕様は `.ai/workflow.md` の「/review-verify」と `.ai/review.md` に従う。
- 引数がある場合はそのIssueを優先し、未指定時は `.context/issue_scope.json` を参照する。
- 引数も `.context` も未設定ならIssue連携なしの通常動作で進め、Issueコメント追記は行わない。
- Issueが確定した場合は Issue本文・コメント確認 でIssue情報を取得し、`primary_issue` と `related_issues` のレビューコメントを収集して各指摘を `採用 / 不採用 / 追加情報必要` で判定する。
- 採用した指摘のみ修正し、必要なテストを実行する。
- Issue連携を行った場合のみ、対象Issueに「判定・修正内容・テスト結果」を追記する。

## ルール

- レビュー内容は鵜呑みにせず、必ず自分で妥当性を検証する。
- 修正対象は採用した指摘のみとする。
- `/commit` / `/c` または `/commit!` / `/c!` の明示的指示がない限りコミットしない。
