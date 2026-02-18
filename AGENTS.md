# AGENTS.md

対象: Codex

## 最重要

**Codex / Claude の共通挙動は [`.ai/behavior.md`](.ai/behavior.md) を正とする。**

- 役割は固定しない（どちらも計画・実装・テスト・レビューを実行可能）
- レビュー結果は対象GitHub Issueコメントに記録する
- `/review-verify` は対象Issueのレビューコメントを検証し、採用した指摘のみ修正する
- 修正内容・進行状況・手順書・計画・レビュー観点は GitHub Issues に集約し、Issue単位worktree + 小PRで進める
- GitHub CLI を使う場合は標準の実行方式を使う。PR操作・レビューコメント記録にも同ルールを適用する

## 必読ドキュメント（常時）

- [`.ai/rules.md`](.ai/rules.md)
- [`.ai/project.md`](.ai/project.md)
- [`.ai/workflow.md`](.ai/workflow.md)
- [`.ai/behavior.md`](.ai/behavior.md)

## `/review-verify` 時の追加必読

- [`.ai/review.md`](.ai/review.md)
- [`.ai/dev-env.md`](.ai/dev-env.md)
- [`.ai/git.md`](.ai/git.md)

## Codex固有の原則

- 詳細は [`.ai/dev-env.md`](.ai/dev-env.md) を正本として参照する
- CodexはSlash Command機能がないため、`/review-verify` 相当はプロンプトで明示指示する
- `/plan` `/pl` `/pick` `/p` `/review-verify` `/rv` `/merge-to-main` `/mtm` `/commit` `/c` `/commit!` `/c!` は疑似コマンドとして扱い、処理内容を依頼文で明示する
- `develop -> main` 反映時は `/merge-to-main` または `/mtm` 相当の手順を必須とする
- `merge-to-main` の定義は [`.claude/commands/merge-to-main.md`](.claude/commands/merge-to-main.md)、短縮形は [`.claude/commands/mtm.md`](.claude/commands/mtm.md) を参照する

## 運用計画（Issue設計とスコープ）

- 新規タスク起票時は、同一目的・同一完了条件の作業を原則1つのIssueに集約し、進捗はIssue本文のチェックリストで管理する
- Issue分割は、優先度・担当・期限・リリース単位が異なる場合に限定し、分割時は親子Issueを `Refs #...` で相互参照する
- `pick` 等の明示指示がない依頼は、まず plan モードとして扱い、Issue設計とスコープ確認を先に行う
- 実装着手時に `primary_issue` と必要な `related_issues` を確定し、Issue単位worktree + 小PRで順次進める
- この方針は Codex / Claude 共通で適用し、正本の `.ai/workflow.md`（必要に応じて `.ai/behavior.md`）を基準として整合させる
