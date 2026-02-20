# Conductor固有プロンプト

Conductorで依頼する際に、依頼文に追加するプロンプトテンプレート。

## review依頼時

```text
- レビュー運用の正は `.ai/review.md` と `.ai/workflow.md` を参照し、重複する指示がある場合はそちらを優先してください。
- 対象Issue番号（例: `#9`）を明記してください。省略する場合は `.context/current_issue` を先に設定してください。
- レビュー結果の報告は必ず日本語で記述してください。
- `/review-verify` 相当の実行時は、指摘ごとに `採用 / 不採用 / 追加情報必要` を明記してください。
- 修正を行った場合は、実施したテスト内容と結果を最終報告に必ず記載してください。
- 対象Issue番号を確定できない場合は、実装を進めずに停止して確認してください。
```

## PR作成依頼時

```text
- PR作成・コミット運用で重複するルールは `.ai/git.md` と `.ai/workflow.md` を参照し、そちらを優先してください。
- PR作成に関する報告・提案・本文はすべて日本語で記述してください。
- PRのbaseブランチは `develop` にしてください。
- `git rev-parse --abbrev-ref HEAD` が `develop` の場合はコミットせず、作業ブランチへ切り替えてください。
- PR本文は日本語で、以下の見出しを含めてください:
  - 概要
  - 変更内容
  - テスト手順
  - 影響範囲
  - チェックリスト
- `Closes` は作業対象のサブIssue番号を記載してください（親Issueではなくサブ）。
- `Refs` は親Issueや関連Issueを記載してください。
- PRマージ後、親Issueの全サブIssueがClose済みなら親Issueもクローズしてください。
- 実行した確認コマンド（例: task check:all, task gen:api, task gen:db）と結果を本文に明記してください。
- 未実施の検証がある場合は「未実施項目」と理由を明記してください。
- 最終報告には、作成/更新したPRのURL（`pr_url`）を必ず記載してください。
- PR作成または更新に失敗した場合は、失敗したコマンドとエラーメッセージを添えて停止し、次アクション確認を行ってください。
```

## Codex向け疑似コマンド

CodexはSlash Commandを使えないため、処理内容を依頼文で明示する。

```text
- AI.md と .ai の必読を読み込み、計画準備状態へ入って（/plan 相当）
- Issue #7 を current_issue として .context/current_issue を更新して（/pick 相当）
- 引数なしで /pick 相当を実施し、priority順でcurrent_issueを自動選定して
- Issue #7 のレビューコメントを検証し、採用指摘のみ修正して（/rv 相当）
- develop から main へのリリースPRを作成してそのままマージして（/mtm 相当）
- git add -A 後に確認付きコミット候補を出して（/commit 相当）
```
