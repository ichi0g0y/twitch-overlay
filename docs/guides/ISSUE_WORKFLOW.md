# GitHub Issue運用仕様

## 目的

修正内容・進行状況・手順・計画・レビュー観点を GitHub Issues に一元化する。

## 基本原則

- 状態管理は GitHub Issue のラベル + Close で行う
- 1 Issue 1 worktree を基本とし、強く関連するIssueのみ同一worktreeで扱う
- PRは小さく分割して順次マージする
- PRのbaseは `develop` を使う
- GitHub操作手段は固定しない（`GitHub CLI` / REST API / GraphQL API のいずれでもよい）
- `GitHub CLI` を使う場合は標準の実行方式を使う
- 認証切り替えが多い環境では、CLIログイン状態への依存を避けてAPI実行を優先してよい

## 状態管理

- `Open`: 未着手/待機中（ラベルなし）
- `In Progress`: `status:in-progress` ラベルを付与
- `Close`: 完了（Issueクローズ）
- `status:in-progress` は着手時に付与し、Issueクローズまで維持する
- ブロッカー発生時はクローズせず、Issueコメントに `阻害要因 / 解除条件 / 次アクション` を残す

## 優先度管理

- `priority:P0`: 最優先（障害/致命）
- `priority:P1`: 高優先
- `priority:P2`: 通常優先
- `priority:P3`: 低優先

優先度の目安:

1. `P0`: サービス停止・致命的不具合・最優先対応
2. `P1`: 重要機能の実装/修正で早期対応が必要
3. `P2`: 通常優先度
4. `P3`: 低優先度・後続対応可

## Issue記載の最低要件

- 目的と背景（なぜ実施するか）
- スコープ（やること / やらないこと）
- 受け入れ条件（完了を判断できる条件）
- 作業チェックリスト（必要なら順序も記載）
- 関連リンク（関連Issue / PR / 設計メモ）

## Issueスコープ管理（標準）

- ファイル変更を伴う依頼は、原則 `/plan` / `/pl` から開始する
- `/plan` / `/pl` は計画準備のみを行い、Issue作成・実装・マージは行わない
- Issue作成はユーザー指示またはIssue番号明示後に実施する
- Issue作成後は `.context/issue_scope.json` に `primary_issue` を保存して共有する
- `/pick` / `/p` は、既存Issueを明示指定するとき、または引数なしで優先度順に自動選定するときの補助コマンドとして使う
- 引数なし時は `priority:P0 -> P1 -> P2 -> P3` の順で Open Issue の最古を選定し、優先度ラベル付きIssueが無い場合は Open Issue 全体の最古を採用する
- 計画相談・壁打ちなど、ファイル変更を伴わない場合はIssueスコープ未設定でもよい
- `.context` 未設定でも、依頼文にIssue番号が明示されていれば進行してよい
- 既に `.context/issue_scope.json` がある状態で再 `/pick` / `/p` する場合は、上書き前に警告し、ユーザー確認を取る
- 再設定時は `上書き / relatedに追加 / 取消` のいずれかを選ぶ
- `/pick` / `/p` 後は `.context/issue_scope.json` の `branch` を作業ブランチとして固定し、勝手に変更しない
- `.context/issue_scope.json` は `schema_version: 2` を基本形式とし、`primary_issue` / `related_issues` / `active_related_issues` を利用する
- `active_related_issues` の状態は `reserved` / `in_progress` / `ready_for_close` / `closed` を使う
- `issue_scope.json` 更新は原子更新を必須とし、ロック取得後に一時ファイルへ書き込み、`mv` で置換する
- 軽微修正をまとめる場合は `primary_issue` + `related_issues` で複数Issueを保持してよい
- 共有ライブラリ変更で複数Issueに影響する場合は、各Issueコメントに関連Issueを相互記載する

```json
{
  "schema_version": 2,
  "primary_issue": 9,
  "related_issues": [12, 15],
  "active_related_issues": {
    "12": {
      "state": "in_progress",
      "owner": "conductor:ws-event:chat-a",
      "reserved_at": "2026-02-15T10:30:00Z",
      "updated_at": "2026-02-15T10:45:00Z"
    }
  },
  "branch": "feature/example",
  "pr_number": 34,
  "pr_url": "https://github.com/example/repo/pull/34",
  "picked_at": "2026-02-15T10:30:00Z",
  "updated_at": "2026-02-15T11:40:00Z"
}
```

## 実装フロー

1. `/plan` / `/pl` で必読を読み込み、`GitHub CLI` を確認する
2. 計画（目的・手順・受け入れ条件・テスト）を提示して承認を得る
3. `/plan` / `/pl` 自体では Issue作成しない
4. Issue化指示またはIssue番号明示を受けたら、対象Issueを確定する
5. ConductorでIssue用workspace（worktree）を作成する（基底は `develop`）
6. 必要なら `/pick` または `/p` で対象Issueを再固定する（引数なし時は優先度順で自動選定）
7. `git rev-parse --abbrev-ref HEAD` が `develop` の場合はコミットせず、Issue用ブランチへ切り替える
8. 着手時に `status:in-progress` を付与する
9. 実装・テストを行い、必要に応じてIssueコメントで進捗共有する
10. レビュー前にPRを作成し、本文へ `Closes #<issue-number>` または `Refs #<issue-number>` を記載する
11. PR作成 を使う場合は `--base develop` を必ず指定する
12. PR作成/更新時に `.context/issue_scope.json` の `pr_number`（必要に応じて `pr_url`）を更新する
13. マージでIssueを自動クローズする（自動クローズされない場合は手動でクローズし、理由を残す）

## PR運用

- 1Issue 1PRを基本とする
- 1PRの変更は小さく保つ
- 着手後の早い段階で Draft PR を作成してもよい
- `Closes` / `Refs` の判定対象は `primary_issue + active_related_issues + related_issues`
- `Closes` は `primary_issue` と、`active_related_issues` が `ready_for_close` / `closed` のIssueを記載する
- `Refs` は `active_related_issues` が `reserved` / `in_progress` のIssue、および候補のみ（`related_issues` のみ）のIssueを記載する
- PR本文には対象Issue番号を明記する
- 仕様判断や運用判断はPRだけに閉じず、要点をIssueコメントにも残す
- `GitHub CLI` でPRを作成/更新する場合は PR操作 を使う

## 完了条件（DoD）

- Issueの受け入れ条件をすべて満たしている
- 必要なテスト/確認手順を実行し、結果をPRまたはIssueで追跡できる
- ドキュメント更新が必要な場合は反映し、不要な場合はIssueコメントで明記する
- 対象Issueと関連Issueの `Closes / Refs` 記載、およびラベル状態が整合している

## レビュー運用

- レビュー依頼時に対象Issue番号を明示する（または `.context` を参照する）
- レビュー開始前に Issue本文・コメント確認 でIssue本文と既存コメントを確認する
- レビュー結果は対象Issueコメントに記録する
- レビュアーはコメント内に対象Issue番号を明記する
- 判定は `採用 / 不採用 / 追加情報必要`
- 各判定には短くても理由を残す
- 指摘にはファイルパス・行番号・根拠を含める
- `/rv` / `/review-verify` でIssue連携した場合は修正結果コメントを対象Issueへ追記する
- `.context` に `related_issues` がある場合は関連Issueもあわせて検証対象にする
- レビュアーは最新の修正結果コメント（`/rv` / `/review-verify` 実行結果）も確認する
- `GitHub CLI` でレビュー結果をIssueへ記録する場合は Issueコメント追記 を使う

## `/review-verify` / `/rv` の挙動

- 引数あり（例: `/rv 9`）の場合は引数のIssue番号を優先する
- 引数なしの場合は `.context/issue_scope.json` を参照する
- 引数も `.context` もない場合はIssue連携なしで通常動作し、Issueコメント追記は行わない
- Issueが確定した場合は Issue本文・コメント確認 で情報を取得し、`primary_issue` と `active_related_issues`（`in_progress` / `ready_for_close`）のレビューコメントを収集する
- 指摘は `採用 / 不採用 / 追加情報必要` で分類し、採用した指摘のみ修正する
- `不採用 / 追加情報必要` の指摘は理由を記録し、未修正として扱う
- 必要なテストを実行し、失敗時は修正して再実行する
- Issue連携を行った場合のみ、対象Issueへ「判定・修正内容・テスト結果」を追記する

## コマンド運用

- Claude Code:
  - `/plan` または `/pl`（計画準備のみ）
  - `/pick [primary-issue] [related-issues...]`（任意、引数なし時は自動選定）
  - `/p [primary-issue] [related-issues...]`（短縮、`/pick` と同ロジック）
  - `/review-verify <issue-number>`
  - `/rv <issue-number>`（引数なし時は `.context` を参照）
  - `/commit` または `/c`（確認付きコミット）
  - `/commit!` または `/c!`（即時コミット）
- Codex:
  - Slash Command は使えないため、疑似コマンドとして同等内容をプロンプトで指示する
  - `/pl` `/p` `/rv` `/c` など短縮文字列だけを送らず、処理内容を文章で明示する
  - 例:
    - `AI.md と .ai の必読を読み込み、計画準備状態へ入って（/plan 相当）`
    - `Issue #7 を primary_issue として .context/issue_scope.json を更新して（/pick 相当）`
    - `引数なしで /pick 相当を実施し、priority順でprimary_issueを自動選定して .context/issue_scope.json を更新して`
    - `Issue #7 のレビューコメントを検証し、採用指摘のみ修正し、結果をIssueコメントに追記して（/rv 相当）`
    - `git add -A 後に確認付きコミット候補を提示して（/commit 相当）`

## 補足

- このファイルの内容が `.ai/workflow.md` と矛盾する場合は、`.ai/workflow.md` を正とする
- `/commit` / `/c` または `/commit!` / `/c!` の明示がない限り、コミットしない
