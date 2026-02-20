# AGENTS.md

対象: Codex

## 最重要

**Codex / Claude の共通運用は [`.ai/workflow.md`](.ai/workflow.md) を正とする。**

- 役割は固定しない（どちらも計画・実装・テスト・レビューを実行可能）
- 修正内容・進行状況・手順書・計画・レビュー観点は GitHub Issues に集約し、Issue単位worktree + 小PRで進める
- レビュー結果は自動投稿せず、必要に応じて手動コピーまたは `.context/` 経由で共有する
- `develop -> main` 反映は `/merge-to-main` または `/mtm` を使う

## 必読ドキュメント（常時）

- [`.ai/rules.md`](.ai/rules.md)
- [`.ai/project.md`](.ai/project.md)
- [`.ai/workflow.md`](.ai/workflow.md)

## レビュー時の追加必読

- [`.ai/review.md`](.ai/review.md)
- [`.ai/dev-env.md`](.ai/dev-env.md)
- [`.ai/git.md`](.ai/git.md)

## Codex固有の原則

- 詳細は [`.ai/dev-env.md`](.ai/dev-env.md) を正本として参照する
- CodexはSlash Command機能がないため、疑似コマンドは処理内容を依頼文で明示する
- `/plan` `/pl` `/pick` `/p` `/review-verify` `/rv` `/merge-to-main` `/mtm` `/commit` `/c` `/commit!` `/c!` は疑似コマンドとして扱う
- `merge-to-main` の定義は [`.claude/commands/merge-to-main.md`](.claude/commands/merge-to-main.md)、短縮形は [`.claude/commands/mtm.md`](.claude/commands/mtm.md) を参照する

## `current_issue` 管理

- 対象Issue確定時は `.context/current_issue` にIssue番号を1行で書き出す
- セッション開始時に `.context/current_issue` があれば対象Issueとして復元する
- 対象PRがマージされ、Issue完了が確認できたら `.context/current_issue` を削除する
