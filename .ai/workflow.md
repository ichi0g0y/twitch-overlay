# ワークフロー

## AI協調フロー

- Codex / Claude の役割は固定しない
- 修正内容・進行状況・手順書・計画・レビュー観点は GitHub Issues に集約する
- GitHub操作手段は固定しない（`GitHub CLI` / REST API / GraphQL API のいずれでもよい）
- `GitHub CLI` を使う場合は標準の実行方式を使う
- 認証切り替えが多い環境では、CLIログイン状態への依存を避けてAPI実行を優先してよい
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
- `/plan` / `/pl` は計画準備のみを行い、Issue作成・実装・マージは行わない
- Issue作成は、ユーザー指示またはIssue番号明示後に実施する
- Issue作成後は `.context/issue_scope.json` に `primary_issue` を保存して共有する
- `/pick` / `/p` は、既存Issueを明示指定するとき、または引数なしで優先度順に自動選定するときの補助コマンドとして使う（`primary_issue` 設定時は Issue本文から概要を数行生成して同時表示する）
- 引数なし時は `priority:P0 -> P1 -> P2 -> P3` の順で Open Issue の最古を選定し、優先度ラベル付きIssueが無い場合は Open Issue 全体の最古を採用する
- 計画相談・壁打ちなど、ファイル変更を伴わない場合はIssueスコープ未設定でもよい
- `.context/issue_scope.json` が未設定でも、依頼文でIssue番号が明示されていれば進行してよい
- `.context/issue_scope.json` は `schema_version: 2` を基本形式とし、`primary_issue` / `related_issues` / `active_related_issues` を使って状態管理する
- `active_related_issues` の状態は `reserved` / `in_progress` / `ready_for_close` / `closed` を使う
- 再 `/pick` / `/p` で既存スコープがある場合は、上書き前に警告してユーザー確認を行う
- 再 `/pick` / `/p` で `relatedに追加` を選んだ場合は、既存 `primary_issue` を維持し、追加Issueを `related_issues` と `active_related_issues` の両方へ登録して継続する（新規登録時のstateは `reserved`）。
- PR作成/更新後は、必要に応じて `.context/issue_scope.json` に `pr_number`（必要なら `pr_url`）を記録し、後続作業で参照できる状態にする
- `issue_scope.json` 更新時は排他制御を必須とし、`mkdir .context/.issue_scope.lock` 等でロック取得後に一時ファイルへ書き込み、`mv` で置換する
- ロックは更新成功/失敗にかかわらず必ず解放する
- 共有ライブラリ変更で複数Issueに影響する場合は、各Issueコメントに関連Issueを相互記載する

想定フォーマット:

```json
{
  "schema_version": 2,
  "primary_issue": 9,
  "related_issues": [12, 15, 18],
  "active_related_issues": {
    "12": {
      "state": "in_progress",
      "owner": "conductor:ws-event:chat-a",
      "reserved_at": "2026-02-15T10:30:00Z",
      "expires_at": "2026-02-15T12:30:00Z",
      "updated_at": "2026-02-15T10:45:00Z"
    },
    "15": {
      "state": "ready_for_close",
      "owner": "conductor:ws-event:chat-a",
      "reserved_at": "2026-02-15T10:50:00Z",
      "updated_at": "2026-02-15T11:40:00Z"
    }
  },
  "branch": "feature/example",
  "pr_number": 34,
  "pr_url": "https://github.com/example/repo/pull/34",
  "picked_at": "2026-02-15T10:30:00Z",
  "updated_at": "2026-02-15T11:40:00Z"
}
```

## 基本フロー

### 0. `/plan` / `/pl`（計画準備）

1. `AI.md` と `.ai/*` の必読を読み込む
2. 認証状態確認 を実行し、GitHub操作可能か事前確認する
3. 計画（目的 / 手順 / 受け入れ条件 / テスト）を提示して承認を得る
4. `/plan` / `/pl` 自体では Issue作成しない
5. その後、Issue化が必要ならユーザー指示を受けて Issue作成 へ進む

### 0.5 初動報告フォーマット（必須）

作業開始時は、実装前に次の4点を先出しで報告する。

1. 読み込んだ必読ドキュメント（`AI.md` / `.ai/*`）
2. 作業対象Issue（`primary_issue` / `related_issues`）
3. 作業前制約（例: `/plan` 先行、コミット条件、検証時の制約）
4. このターンで最初に実行する具体アクション

### 1. Issue化とスコープ固定

1. 実装をIssue連携で進める場合は、対象Issue番号を確定する
2. 必要なら `/pick` または `/p` で対象Issueを再固定する
3. 固定時は `schema_version: 2` の `issue_scope` 形式で `primary_issue` / `related_issues` / `active_related_issues` を記録する
4. `.context/issue_scope.json` が未設定でも、Issue番号を依頼文で明示して進めてよい

### 2. 実装

1. 対象Issue番号が確定していることを確認する
2. Conductorで対象Issue用のworkspace（worktree）を作成する
3. このリポジトリの基底ブランチは `develop` を使う
4. `git rev-parse --abbrev-ref HEAD` が `develop` の場合はコミットせず、Issue用ブランチへ切り替える
5. 着手時にIssueへ `status:in-progress` を付与する
6. 実装・テストを行い、必要に応じてIssueコメントで進捗共有する

### 3. レビュー

1. レビュー依頼時は対象Issue番号を明示する
2. 引数がない場合は `.context/issue_scope.json` の `primary_issue` を参照する
3. レビュー前に Issue本文・コメント確認 でIssue本文と既存コメントを確認する
4. レビュー結果は GitHub Issue コメントに記載する
5. レビュアーは対象Issue番号をコメント内に明記する
6. 指摘は `採用 / 不採用 / 追加情報必要` で判定する
7. 指摘にはファイルパス・行番号・根拠を含める
8. レビュアーは最新の修正結果コメント（`/rv` / `/review-verify` の結果）も確認する
9. `GitHub CLI` でレビュー結果を Issue に記録する場合は Issueコメント追記 を使う

### 4. `/review-verify`

- Claude Code:
  - `/review-verify <issue-number>` または `/rv <issue-number>` を使用する
  - 引数がない場合は `.context/issue_scope.json` の `primary_issue` と `active_related_issues`（`in_progress` / `ready_for_close`）を対象にする
  - 引数も `.context/issue_scope.json` もない場合は通常動作で進め、Issue連携は行わない
  - 指摘を反映したIssueのみ `active_related_issues` の状態を更新する
  - Issue連携を行った場合のみ、修正後に対象Issueへ修正結果コメントを追記する
- Codex:
  - Slash Command は使えないため、同等内容をプロンプトで指示する
  - 例: 「Issue #9 の最新レビューコメントを検証し、採用指摘のみ修正し、反映したIssueの `active_related_issues` 状態を更新して結果をIssueコメントに追記」

### 5. Codex疑似コマンド運用

- Codexでは `/pick` `/p` `/review-verify` `/rv` `/merge-to-main` `/mtm` `/commit` `/c` `/commit!` `/c!` をコマンドとして直接実行できない
- Codexでは `/plan` `/pl` もコマンドとして直接実行できない
- 短縮形（`/pl` `/p` `/rv` `/mtm` `/c` `/c!`）はClaude Code向けの別名であり、Codexではそのまま送らない
- Codexへは「`/pick` 相当を実施」「`/rv` 相当を実施」「`/mtm` 相当を実施」のように、処理内容を文章で明示する
- 例:
  - `AI.md と .ai の必読を読み込み、計画準備状態へ入って（/plan 相当）`
  - `Issue #7 を primary_issue として .context/issue_scope.json を更新し、Issue本文から概要を数行表示して（/pick 相当）`
  - `引数なしで /pick 相当を実施し、priority順でprimary_issueを自動選定して .context/issue_scope.json を更新し、Issue本文から概要を数行表示して`
  - `Issue #7 のレビューコメントを検証し、採用指摘のみ修正してIssueへ結果コメントして（/rv 相当）`
  - `develop から main へのリリースPRを作成して通常はそのままマージし、必要なら --no-merge で作成のみ実行して、.context の pr_number/pr_url を更新して（/mtm 相当）`
  - `git add -A 後に確認付きでコミット候補を提示して（/commit 相当）`
  - `git add -A 後に最初の候補で即コミットして（/commit! 相当）`

### 6. PRと完了

1. `Closes` / `Refs` の判定対象は `primary_issue + active_related_issues + related_issues` とする
2. `Closes` は `primary_issue` と、`active_related_issues` が `ready_for_close` / `closed` のIssueを記載する
3. `Refs` は `active_related_issues` が `reserved` / `in_progress` のIssue、および候補のみ（`related_issues` のみ）のIssueを記載する
4. 複数Issueを同一PRで扱う場合、上記判定に沿って `Closes #...` / `Refs #...` を複数併記してよい
5. `GitHub CLI` で PR を作成/更新する場合は PR操作 を使い、`pr create` では `--base develop` を必ず明示する
6. PR作成/更新後は `.context/issue_scope.json` に `pr_number`（必要なら `pr_url`）を記録する
7. PRが基底ブランチへマージされたらIssueが自動クローズされる
8. `develop -> main` 反映時は `/merge-to-main` / `/mtm` 相当の手順を必須とする
