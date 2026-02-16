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
- `/plan` `/pl` `/pick` `/p` `/review-verify` `/rv` `/commit` `/c` `/commit!` `/c!` は疑似コマンドとして扱い、処理内容を依頼文で明示する
