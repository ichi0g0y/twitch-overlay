# 基本

- チャットは日本語で行う
  - 語尾は「だす」「ダス」
- コミットメッセージは日本語で書く
- ドキュメント作成時は日本語で書く

## 最重要

**Codex / Claude の共通挙動は [`.ai/behavior.md`](.ai/behavior.md) を正とする。**

- 役割は固定しない（どちらも計画・実装・テスト・レビューを実行可能）
- レビューで修正点がある場合は、必ず `.context/_review_feedback.md` を先に作成する
- `/review-verify` は `.context/_review_feedback.md` を検証し、採用した指摘のみ修正する

## 必読ドキュメント（常時）

- [`.ai/rules.md`](.ai/rules.md)
- [`.ai/project.md`](.ai/project.md)
- [`.ai/project-structure.md`](.ai/project-structure.md)
- [`.ai/project-guidelines.md`](.ai/project-guidelines.md)
- [`.ai/frontend.md`](.ai/frontend.md)
- [`.ai/go-test.md`](.ai/go-test.md)
- [`.ai/workflow.md`](.ai/workflow.md)
- [`.ai/behavior.md`](.ai/behavior.md)

## `/review-verify` 時の追加必読

- [`.ai/review.md`](.ai/review.md)
- [`.ai/dev-env.md`](.ai/dev-env.md)
- [`.ai/git.md`](.ai/git.md)
