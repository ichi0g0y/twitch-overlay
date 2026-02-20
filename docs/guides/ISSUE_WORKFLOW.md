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
- 対象Issue確定時は `.context/current_issue` にIssue番号を1行で書き出す
- `/pick` / `/p` は、既存Issueを明示指定するとき、または引数なしで優先度順に自動選定するときの補助コマンドとして使う
- 引数なし時は `priority:P0 -> P1 -> P2 -> P3` の順で Open Issue の最古を選定し、優先度ラベル付きIssueが無い場合は Open Issue 全体の最古を採用する
- 計画相談・壁打ちなど、ファイル変更を伴わない場合はIssueスコープ未設定でもよい
- `.context/current_issue` 未設定でも、依頼文にIssue番号が明示されていれば進行してよい
- セッション開始時に `.context/current_issue` があれば対象Issueとして復元する
- 対象PRがマージされ、Issue完了が確認できたら `.context/current_issue` を削除する
- 共有ライブラリ変更で複数Issueに影響する場合は、各Issueコメントに関連Issueを相互記載する

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
12. マージでIssueを自動クローズする（自動クローズされない場合は手動でクローズし、理由を残す）

## 作業開始時の初動報告（必須）

実装に入る前に、次の4点を先出しで報告する。

1. 読み込んだ必読ドキュメント
2. 作業対象Issue（`.context/current_issue` の値）
3. 作業前制約（例: `/plan` 先行、コミット条件）
4. 最初に実行する具体アクション

## PR運用

- 1Issue 1PRを基本とする
- 1PRの変更は小さく保つ
- 着手後の早い段階で Draft PR を作成してもよい
- PR本文には対象Issue番号を `Closes #<issue-number>` で明記する
- 仕様判断や運用判断はPRだけに閉じず、要点をIssueコメントにも残す
- `GitHub CLI` でPRを作成/更新する場合は PR操作 を使う

## 完了条件（DoD）

- Issueの受け入れ条件をすべて満たしている
- 必要なテスト/確認手順を実行し、結果をPRまたはIssueで追跡できる
- ドキュメント更新が必要な場合は反映し、不要な場合はIssueコメントで明記する
- 対象Issueの `Closes` 記載、およびラベル状態が整合している

## レビュー運用

- レビュー依頼時に対象Issue番号を明示する（または `.context/current_issue` を参照する）
- レビュー開始前にIssue本文と既存コメントを確認する
- レビュー結果は自動投稿せず、必要に応じて手動コピーまたは `.context/` 経由で共有する
- レビュアーはコメント内に対象Issue番号を明記する
- 判定は `採用 / 不採用 / 追加情報必要`
- 各判定には短くても理由を残す
- 指摘にはファイルパス・行番号・根拠を含める
- `/rv` / `/review-verify` でIssue連携した場合は修正結果コメントを対象Issueへ追記する
- レビュアーは最新の修正結果コメント（`/rv` / `/review-verify` 実行結果）も確認する

## `/review-verify` / `/rv` の挙動

- 引数あり（例: `/rv 9`）の場合は引数のIssue番号を優先する
- 引数なしの場合は `.context/current_issue` を参照する
- 引数も `.context/current_issue` もない場合はIssue連携なしで通常動作し、Issueコメント追記は行わない
- Issueが確定した場合はIssue本文とコメントを取得し、レビューコメントを収集する
- 指摘は `採用 / 不採用 / 追加情報必要` で分類し、採用した指摘のみ修正する
- `不採用 / 追加情報必要` の指摘は理由を記録し、未修正として扱う
- 必要なテストを実行し、失敗時は修正して再実行する
- Issue連携を行った場合のみ、対象Issueへ「判定・修正内容・テスト結果」を追記する

## コマンド運用

- Claude Code:
  - `/plan` または `/pl`（計画準備のみ）
  - `/pick [issue-number]`（任意、引数なし時は自動選定）
  - `/p [issue-number]`（短縮、`/pick` と同ロジック）
  - `/review-verify <issue-number>`
  - `/rv <issue-number>`（引数なし時は `.context` を参照）
  - `/commit` または `/c`（確認付きコミット）
  - `/commit!` または `/c!`（即時コミット）
- Codex:
  - Slash Command は使えないため、疑似コマンドとして同等内容をプロンプトで指示する
  - `/pl` `/p` `/rv` `/c` など短縮文字列だけを送らず、処理内容を文章で明示する
  - 例:
    - `必読ドキュメントを読み込み、計画準備状態へ入って（/plan 相当）`
    - `Issue #7 を対象として .context/current_issue を更新して（/pick 相当）`
    - `引数なしで /pick 相当を実施し、priority順でIssueを自動選定して .context/current_issue を更新して`
    - `Issue #7 のレビューコメントを検証し、採用指摘のみ修正し、結果をIssueコメントに追記して（/rv 相当）`
    - `git add -A 後に確認付きコミット候補を提示して（/commit 相当）`

## 補足

- このファイルの内容が `.ai/workflow.md` と矛盾する場合は、`.ai/workflow.md` を正とする
- `/commit` / `/c` または `/commit!` / `/c!` の明示がない限り、コミットしない
