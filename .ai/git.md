# Gitコミットルール

## コミット制限

- `/commit` / `/c` または `/commit!` / `/c!` の明示がない限り、コミットしない
- 曖昧な承認（OK、進めて等）ではコミットしない

## メッセージ形式

- 形式: `絵文字 scope: 説明`
- 説明は日本語で簡潔に書く

### 例

- `✨ docs: 初期ガイドを追加`
- `📝 ai: ルール文書を整理`
- `♻️ root: テンプレート構成を簡素化`

## `/commit` と `/commit!`

- `/commit`: 候補メッセージを提示し、確認後にコミット
- `/commit!`: 最初の候補で即コミット
- `/c`: `/commit` の短縮コマンド
- `/c!`: `/commit!` の短縮コマンド
- どちらも `git add -A` を前提に運用する

## ブランチ・worktree運用

- `develop` ブランチを基点にIssue単位のブランチを作成する
- Issue単位で専用worktreeを作成し、作業の混線を防ぐ
- レビューや検証で分離が必要な場合は、追加worktreeを作成して確認する
- `git rev-parse --abbrev-ref HEAD` の結果が `develop` の場合、コミットせず作業ブランチへ切り替える

## PR運用

- 1Issue 1PRを基本とする
- 1PRの変更は小さく保ち、段階的に適用する
- PRのbaseブランチは `develop` とする
- PR作成 を使う場合、`--base develop` を省略しない
- PR本文には対象Issue（`#<issue-number>`）への参照を記載する
- 完了したIssueは PR本文に `Closes #<issue-number>` を記載し、マージ時に自動クローズする
- 参照だけのIssueは `Refs #<issue-number>` を使う
- 複数Issueを同一PRで完了させる場合は、複数の `Closes #...` を記載してよい
- `GitHub CLI` で PR を作成/更新する場合は PR操作 を使う
