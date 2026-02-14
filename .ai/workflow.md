# ワークフロー

## AI協調フロー

- Codex / Claude の役割は固定しない
- `.context/tasks` は使用しない
- レビュー連携は `.context/_review_feedback.md` のみを使う
- 手順書・計画・レビュー観点は `issues/` に集約する
- Issue単位でworktreeを分け、小さなPRを順次適用する

## 0. 初期化（BOOTSTRAP準拠）

1. `AGENTS.md` → `AI.md` → `CLAUDE.md` → 必読ルール（`.ai/behavior.md` / `.ai/rules.md` / `.ai/workflow.md` / `.ai/project.md`）を確認する
2. 対象Issue（`issues/open/` / `issues/in-progress/` / `issues/review-waiting/`）を確認し、必要なら新規Issueを作成する
3. 作業開始時に以下を先に報告する
   - 読み込んだルールファイル
   - 今回の作業対象
   - 作業前に守る制約

## 1. 実装

1. `issues/open/` か `issues/in-progress/` の対象Issueを確認する（なければ作成する）
2. 必要なら `develop` からIssue専用worktree/ブランチを作成する
3. 実装・検証を行う
4. Issue本文のチェックリストと `issues/index.md` を更新する
5. 実装内容と検証結果を報告する

## 2. レビュー

1. 変更差分をレビューする（観点は `.ai/review.md` を参照）
2. 修正点がある場合は、先に `.context/_review_feedback.md` を作成する
3. 指摘には重要度、根拠、影響、再現条件を明記する
4. 修正点がない場合は `.context/_review_feedback.md` を作成しない
5. 報告時に `.context/_review_feedback.md` の出力有無を明記する
6. レビュー依頼時はIssue状態を `issues/review-waiting/` に更新する
7. 修正点がある場合は、対応着手時にIssueを `issues/in-progress/` へ戻す
8. レビュー時点ではIssue状態を `Done` へ遷移させない

## 3. `/review-verify`

1. `.context/_review_feedback.md` の有無を確認する
2. 指摘を採用/不採用/追加情報必要に分類する
3. 採用した指摘のみ修正し、不採用・追加情報必要の理由を記録する
4. 必要なテストや検証を実行する
5. 完了後に `.context/_review_feedback.md` を削除する
6. 結果を報告する（採用/不採用/追加情報必要の内訳を含める）
7. 未解決の採用指摘がなくなったらIssueを `issues/review-waiting/` に戻して再レビューする
8. 修正なしレビュー完了かつPRマージ完了後に `issues/done/` へ移動する（記録不要ならCloseとして削除してよい）

## 4. AI指示移植（既存プロジェクト向け）

1. テンプレート側 `BOOTSTRAP.md` と `docs/guides/AI_INSTRUCTION_PORTING.md` を参照し、不足ファイルを洗い出す
2. `.ai/project.md` / `.ai/rules.md` / `.ai/workflow.md` を対象プロジェクトへ調整する
3. テンプレート側 `BOOTSTRAP.md` / `docs/guides/AI_INSTRUCTION_PORTING.md` は参照専用とし、対象リポジトリへ追加しない
4. 既存 `AGENTS.md` / `CLAUDE.md` / `AI.md` / `.ai/*.md` は上書きせず統合する
5. 採用方針（採用 / 不採用 / 保留）を必ず報告する

## Issue管理

- 状態遷移は `issues/open/` → `issues/in-progress/` → `issues/review-waiting/` → `issues/done/` を基本とする
- レビュー指摘の採用分対応に着手する場合は `issues/in-progress/` へ戻す
- `Done` への遷移は、レビュー指摘の採用分対応完了とPRマージ完了後に行う
- 記録不要な完了Issueは `issues/done/` へ置かずClose（削除）してよい
- 既存の背景資料は `issues/open/issue-progression-lottery-migration/README.md` を参照し、新規実行計画はIssueへ追記する
- TODO管理はIssue管理へ統一し、進捗の正本を `issues/` に置く
- `docs/TODO.md` などタスク管理文書はIssue移行後に参照有無を確認して削除する

## Worktree + PR運用

1. まず `issues/open/` にIssueを作成し、目的・手順・受け入れ条件を定義する
2. `develop` からIssue専用worktreeを作成して実装する
3. レビュー依頼時はIssueを `issues/review-waiting/` に移動する
4. 1Issue 1PRを基本とし、PRは小さく分割して順次マージする
5. 修正が必要な場合はIssueを `issues/in-progress/` に戻して対応し、解消後に再度 `issues/review-waiting/` でレビューする
6. 修正なしレビュー完了かつPRマージ完了後に `issues/done/` へ移動する（不要なら削除）
7. マージ後または削除時は `issues/index.md` を更新する
