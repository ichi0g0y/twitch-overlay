# Gitコミットルール

## コミット制限

- `/commit` または `/commit!` の明示がない限り、コミットしない
- 曖昧な承認（OK、進めて等）ではコミットしない

## メッセージ形式

- 既存 `AGENTS.md` の絵文字ガイドに従う
- 件名・本文は日本語で簡潔に書く

## `/commit` と `/commit!`

- `/commit`: 候補メッセージを提示し、確認後にコミット
- `/commit!`: 最初の候補で即コミット
- どちらも `git add -A` を前提に運用する

## ブランチ・worktree運用

- `develop` を基点にIssue単位のブランチを作成する
- Issue単位で専用worktreeを作成し、作業の混線を防ぐ
- レビューや検証で分離が必要な場合は、追加worktreeを作成して確認する

## PR運用

- 1Issue 1PRを基本とする
- 1PRの変更は小さく保つ
- PRのbaseブランチは `develop` とする
- PR本文には対象Issue（`issues/.../README.md`）への参照を記載する
