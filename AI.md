# AI

このドキュメントは、**Conductor上でこのリポジトリを扱うときの追加プロンプト設定**だけをまとめたものです。

実装方針・レビュー運用・厳守ルールはこのファイルでは定義しません。
必ず `.ai/` 配下のルールドキュメントを参照してください（正はそちらです）。

- `.ai/behavior.md`
- `.ai/rules.md`
- `.ai/workflow.md`
- `.ai/review.md`
- `.ai/git.md`

## コーディングからレビューまでの流れ（Conductor）

Conductorでの基本的な進め方は、次の順番です。

1. `/plan` または `/pl` で計画準備を行う（計画のみ。Issue作成はしない）
2. 必要に応じてIssue化する（依頼文でIssue番号明示、または指示後にIssue作成）
3. Issue単位でworktreeを作成して実装する
4. レビュー時は `.context` のIssue情報を起点に GitHub Issue を読み、レビュー結果をIssueコメントへ記載する
5. `/review-verify <issue-number>` または `/rv <issue-number>` で指摘対応し、修正結果をIssueコメントへ追記する（引数なし時は `.context` を参照）
6. PR作成/更新時に `.context/issue_scope.json` の `pr_number`（必要に応じて `pr_url`）を更新する

### コマンド説明

- コーディング依頼: 明示コマンドは不要です。通常の依頼文で実装を指示します。
- `/plan` または `/pl`: `AI.md` と `.ai/*` を読み込み、`GitHub CLI` を確認して計画を提示します。**Issue作成は行いません**。実装・マージも行いません。
- `/pick [primary-issue] [related-issues...]` または `/p [primary-issue] [related-issues...]`: 対象Issueを `.context/issue_scope.json` に固定します（任意）。引数なし時は Open Issue から `priority:P0 -> P1 -> P2 -> P3` の順で最古Issueを自動選定し、該当が無い場合は Open Issue 全体の最古を採用します（`scripts/pick_issue_scope.sh` を使用）。
- レビュー依頼: 明示コマンドは不要です。差分レビューを依頼します。
- `/review-verify <issue-number>` または `/rv <issue-number>`: 対象Issueのレビューコメントを読み込み、採用された指摘のみ修正します。Issue連携した場合は修正結果コメントをIssueへ追記します。引数なし時は `.context/issue_scope.json` の `primary_issue` と `active_related_issues`（`in_progress` / `ready_for_close`）を参照します。
- `/commit` または `/c`: 確認付きコミットです。候補メッセージ確認後にコミットします。
- `/commit!` または `/c!`: 確認なしで即時コミットします。

注記:

- 上記のスラッシュコマンドは Claude Code 前提です。
- Codex では疑似コマンド運用になるため、`/p` などの文字列だけではなく処理内容を依頼文で明示してください。
- Codexへの指示例:
  - `AI.md と .ai の必読を読み込み、計画準備状態へ入って（/plan 相当）`
  - `Issue #7 を primary_issue として .context/issue_scope.json を更新して（/pick 相当）`
  - `引数なしで /pick 相当を実施し、priority順でprimary_issueを自動選定して .context/issue_scope.json を更新して`
  - `Issue #7 のレビューコメントを検証し、採用指摘のみ修正してIssueへ結果コメントして（/rv 相当）`
  - `git add -A 後に確認付きコミット候補を出して（/commit 相当）`

### レビュー連携の要点

- レビューで修正点がある場合は、レビュー担当が対象Issueへレビューコメントを追加します。
- レビュー結果の報告は日本語で記述します。
- CodexはSlash Commandを使えないため、同等処理はプロンプトで明示指示します。

### Issue番号の受け渡し

- 基本は `Issue #9` のように依頼文で明示する方法です。
- 必要なら `/pick` `/p` で `.context/issue_scope.json` に保持して引き回します。
- `.context` の基本形式は `schema_version: 2`（`primary_issue` / `related_issues` / `active_related_issues`）です。
- `.context` 未設定時は通常動作で進め、Issue固定フローは使いません。
- `.context` と引数の両方がある場合は、引数を優先して扱います。

## Conductor利用時の追加プロンプト

Conductorで依頼する際は、依頼文に次の追加条件を含めてください。
特に、回答・報告・PR本文は日本語で記述することを毎回明記してください。

### review依頼時

```text
- レビュー運用の正は `.ai/review.md` と `.ai/workflow.md` を参照し、重複する指示がある場合はそちらを優先してください。
- 対象Issue番号（例: `#9`）を明記してください。省略する場合は `.context/issue_scope.json` を先に設定してください。
- **レビュー開始前に**、対象Issueの既存コメント（特に `/rv` / `/review-verify` 実行結果）を Issue本文・コメント確認 で必ず確認してください。
- レビュー結果の報告は必ず日本語で記述してください。
- レビュー結果は対象Issueコメントに記載してください。
- GitHub CLI でレビュー結果をIssueへ記録する場合は Issueコメント追記 を使ってください。
- `/review-verify` 相当の実行時は、指摘ごとに `採用 / 不採用 / 追加情報必要` を明記してください。
- 修正を行った場合は、実施したテスト内容と結果を最終報告に必ず記載してください。
- 最終報告には、追記したIssueコメントのURL（`issue_comment_url`）を必ず記載してください。
- 対象Issue番号を確定できない、またはIssueコメントの追記に失敗した場合は、実装を進めずに停止して確認してください。
```

### PR作成依頼時

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
- `Closes` / `Refs` の判定対象は `primary_issue + active_related_issues + related_issues` にしてください。
- `Closes` には `primary_issue` と `active_related_issues` が `ready_for_close` / `closed` のIssueを記載してください。
- `Refs` には `active_related_issues` が `reserved` / `in_progress` のIssue、および候補のみ（`related_issues` のみ）のIssueを記載してください。
- GitHub CLI でPRを作成/更新する場合は PR操作 を使ってください。
- PR作成 では `--base develop` を省略しないでください。
- PR作成/更新後は `.context/issue_scope.json` の `pr_number`（必要に応じて `pr_url`）を更新し、後続作業で参照できるようにしてください。
- 実行した確認コマンド（例: task check:all, task gen:api, task gen:db）と結果を本文に明記してください。
- 未実施の検証がある場合は「未実施項目」と理由を明記してください。
- 最終報告には、作成/更新したPRのURL（`pr_url`）を必ず記載してください。
- 関連Issueへ進捗コメントを追記した場合は、そのIssueコメントURL（`issue_comment_url`）も記載してください。
- PR作成または更新に失敗した場合は、失敗したコマンドとエラーメッセージを添えて停止し、次アクション確認を行ってください。
```
