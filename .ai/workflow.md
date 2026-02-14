# ワークフロー

## AI協調フロー

- Codex / Claude の役割は固定しない
- `.context/tasks` は使用しない
- レビュー連携は `.context/_review_feedback.md` のみを使う
- 手順書・計画・レビュー観点は `issues/` に集約する
- Issue単位でworktreeを分け、小さなPRを順次適用する

## 基本フロー

### 1. 実装

1. `issues/open/` か `issues/in-progress/` の対象Issueを確認する（なければ作成する）
2. 必要なら `develop` からIssue専用worktree/ブランチを作成する
3. 実装・検証を行う
4. Issue本文のチェックリストと `issues/index.md` を更新する
5. 実装内容と検証結果を報告する

### 2. レビュー

1. 変更差分をレビューする（観点は `.ai/review.md` を参照）
2. 修正点がある場合は、先に `.context/_review_feedback.md` を作成する
3. レビュー結果を報告する
4. 修正点がない場合は `.context/_review_feedback.md` を作成しない
5. 報告時に `.context/_review_feedback.md` の出力有無を明記する

### 3. `/review-verify`

1. `.context/_review_feedback.md` の有無を確認する
2. 指摘を採用/不採用/追加情報必要に分類する
3. 採用した指摘のみ修正する
4. 必要なテストや検証を実行する
5. 完了後に `.context/_review_feedback.md` を削除する
6. 結果を報告する

## Issue管理

- 状態遷移は `issues/open/` → `issues/in-progress/` → `issues/done/`
- 既存 `docs/TASK_*.md` / `docs/PROGRESSION.md` は「背景資料」とし、新規実行計画はIssueへ追記する
- TODO管理はIssue管理へ統一し、進捗の正本を `issues/` に置く

## Worktree + PR運用

1. まず `issues/open/` にIssueを作成し、目的・手順・受け入れ条件を定義する
2. `develop` からIssue専用worktreeを作成して実装する
3. レビュー時は必要に応じて別worktreeで差分確認する
4. 1Issue 1PRを基本とし、PRは小さく分割して順次マージする
5. マージ後は `issues/index.md` とIssue状態を更新する
