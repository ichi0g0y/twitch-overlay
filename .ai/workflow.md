# ワークフロー

## AI協調フロー

- Codex / Claude の役割は固定しない
- 修正内容・進行状況・手順書・計画・レビュー観点は GitHub Issues に集約する
- GitHub操作手段は固定しない（`gh` / REST API / GraphQL API のいずれでもよい）
- `gh` を使う場合は `scripts/ghx ...` を基本とする
- GitHub操作の前に `direnv` と `scripts/ghx` が使える状態を確認する
- 認証切り替えが多い環境では、`gh auth` 依存を避けてAPI実行を優先してよい
- 状態管理は GitHub Issue のラベル + Close で運用する
- 1 Issue 1 worktree を基本とし、強く関連するIssueのみ同一worktreeで扱う
- PR は小さく分割して順次マージする
- 既存の未コミット変更があっても、Issue作成とIssue番号の確定は通常どおり進める

## Issue状態とラベル

- `Open`: 未着手/待機中（ラベルなし）
- `In Progress`: `status:in-progress` ラベルを付与
- `Close`: 完了。PRマージ後にIssueをクローズする
- 優先度は `priority:P0` / `priority:P1` / `priority:P2` / `priority:P3` で管理する

優先度の目安:

1. `P0`: サービス停止・致命的不具合・最優先対応
2. `P1`: 重要機能の実装/修正で早期対応が必要
3. `P2`: 通常優先度
4. `P3`: 低優先度・後続対応可

## Issueスコープ管理（標準）

- ファイル変更を伴う依頼は、原則 `/plan` / `/pl` から開始する
- `/plan` 承認後に作成したIssueを `.context/issue_scope.json` へ保存して共有する
- `/pick` / `/p` は、既存Issueを明示指定するときの補助コマンドとして使う
- 計画相談・壁打ちなど、ファイル変更を伴わない場合はIssueスコープ未設定でもよい
- `.context/issue_scope.json` が未設定でも、依頼文でIssue番号が明示されていれば進行してよい
- 再 `/pick` / `/p` で既存スコープがある場合は、上書き前に警告してユーザー確認を行う
- 複数Issueに関係する作業では、`primary_issue` + `related_issues` で複数Issueを保持することを基本とする
- PR作成/更新後は、必要に応じて `.context/issue_scope.json` に `pr_number`（必要なら `pr_url`）を記録し、`/merge` の解決候補として使える状態にする
- 共有ライブラリ変更で複数Issueに影響する場合は、各Issueコメントに関連Issueを相互記載する

想定フォーマット:

```json
{
  "primary_issue": 9,
  "related_issues": [12, 15],
  "branch": "feature/example",
  "pr_number": 34,
  "pr_url": "https://github.com/example/repo/pull/34",
  "picked_at": "2026-02-15T10:30:00Z"
}
```

## 基本フロー

### 0. `/plan` / `/pl`（計画とIssue起票）

1. `AI.md` と `.ai/*` の必読を読み込む
2. `direnv/ghx` の事前確認を行う（必要なら `bash scripts/setup_envrc.sh`）
3. 計画（目的 / 手順 / 受け入れ条件 / テスト）を提示して承認を得る
4. 承認後に `scripts/ghx issue create` でIssueを作成する
5. `primary_issue` を `.context/issue_scope.json` に保存する
6. `pr_number` / `pr_url` は未作成状態で初期化する

### 1. スコープ固定（任意）

1. 必要なら `/pick` または `/p` で対象Issueを再固定する
2. 固定時は `primary_issue` と `related_issues` を明示し、複数Issueがある場合は `related_issues` に必ず記録する
3. `.context/issue_scope.json` が未設定でも、Issue番号を依頼文で明示して進めてよい

### 2. 実装

1. 対象Issue番号が確定していることを確認する
2. Conductorで対象Issue用のworkspace（worktree）を作成する
3. 基底ブランチはリポジトリ標準の基底ブランチを使う（`main` 固定にしない）
4. 着手時にIssueへ `status:in-progress` を付与する
5. 実装・テストを行い、必要に応じてIssueコメントで進捗共有する

### 3. レビュー

1. レビュー依頼時は対象Issue番号を明示する
2. 引数がない場合は `.context/issue_scope.json` の `primary_issue` を参照する
3. レビュー前に `scripts/ghx issue view <issue-number> --comments` でIssue本文と既存コメントを確認する
4. レビュー結果は GitHub Issue コメントに記載する
5. レビュアーは対象Issue番号をコメント内に明記する
6. 指摘は `採用 / 不採用 / 追加情報必要` で判定する
7. 指摘にはファイルパス・行番号・根拠を含める
8. レビュアーは最新の修正結果コメント（`/rv` / `/review-verify` の結果）も確認する
9. `gh` でレビュー結果を Issue に記録する場合は `scripts/ghx issue comment ...` を使う

### 4. `/review-verify`

- Claude Code:
  - `/review-verify <issue-number>` または `/rv <issue-number>` を使用する
  - 引数がない場合は `.context/issue_scope.json` を参照する
  - 引数も `.context/issue_scope.json` もない場合は通常動作で進め、Issue連携は行わない
  - `.context` に `related_issues` がある場合は関連Issueも対象に検証する
  - Issue連携を行った場合のみ、修正後に対象Issueへ修正結果コメントを追記する
- Codex:
  - Slash Command は使えないため、同等内容をプロンプトで指示する
  - 例: 「Issue #9 の最新レビューコメントを検証し、採用指摘のみ修正し、結果をIssueコメントに追記」

### 5. Codex疑似コマンド運用

- Codexでは `/pick` `/p` `/review-verify` `/rv` `/commit` `/c` `/commit!` `/c!` をコマンドとして直接実行できない
- Codexでは `/plan` `/pl` `/merge` `/m` もコマンドとして直接実行できない
- 短縮形（`/pl` `/p` `/rv` `/m` `/c` `/c!`）はClaude Code向けの別名であり、Codexではそのまま送らない
- Codexへは「`/pick` 相当を実施」「`/rv` 相当を実施」のように、処理内容を文章で明示する
- 例:
  - `AI.md と .ai の必読を読み込み、direnv/ghx確認と計画承認後のIssue作成まで実施して（/plan 相当）`
  - `Issue #7 を primary_issue として .context/issue_scope.json を更新して（/pick 相当）`
  - `Issue #7 のレビューコメントを検証し、採用指摘のみ修正してIssueへ結果コメントして（/rv 相当）`
  - `PR #14 を安全確認して scripts/ghx でマージし、Issueへ結果コメントして（/merge 相当）`
  - `git add -A 後に確認付きでコミット候補を提示して（/commit 相当）`
  - `git add -A 後に最初の候補で即コミットして（/commit! 相当）`

### 6. PRと完了

1. PR本文に `Closes #<issue-number>` を記載する
2. 複数Issueを同一PRで完了させる場合は、複数の `Closes #...` を記載してよい
3. 参照のみのIssueは `Refs #<issue-number>` を使う
4. `gh` で PR を作成/更新する場合は `scripts/ghx pr ...` を使う
5. PR作成/更新後は `.context/issue_scope.json` に `pr_number`（必要なら `pr_url`）を記録する
6. PRが基底ブランチへマージされたらIssueが自動クローズされる

### 7. `/merge` / `/m`

1. `/merge` は `.context/issue_scope.json` の `pr_number` を最優先に解決する
2. 事前確認（Draft/mergeable/必須チェック）に通過した場合のみ `scripts/ghx pr merge` を実行する
3. マージ結果は `primary_issue`（必要に応じて `related_issues`）へコメント追記する
