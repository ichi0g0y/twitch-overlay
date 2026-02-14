# Issues 運用ガイド

`issues/` は、揮発的な実装タスクを管理する専用ディレクトリです。
固定知識（仕様や方針）は `docs/`、未完了タスクは `issues/` に分離します。

## ディレクトリ構成

- `issues/index.md`: 全Issueの一覧（状態別）
- `issues/templates/issue.md`: Issue記入テンプレート
- `issues/open/`: 未着手Issue
- `issues/in-progress/`: 進行中Issue
- `issues/review-waiting/`: レビュー待ちIssue
- `issues/done/`: 完了Issue（アーカイブ）

## 命名規則

- 新規Issue ID: `api-error-handling` のようなkebab-case（連番なし）
- 新規Issueディレクトリ名: Issue IDと同一（例: `api-error-handling`）
- Issue本文: 各Issueディレクトリの `README.md`
- コード内TODO ID: `abc123` 形式（6文字英数字）

## 状態遷移

1. 作成時は `issues/open/` に配置する
2. 着手したら `issues/in-progress/` に移動する
3. レビュー依頼時は `issues/review-waiting/` に移動する
4. レビュー指摘の採用分対応に着手する場合は `issues/in-progress/` に戻す
5. レビュー指摘の採用分を反映し、PRマージまで完了したら `issues/done/` に移動する
6. 修正なしレビュー完了の場合も、PRマージ完了後に `issues/done/` へ移動する
7. 記録が不要なIssueは、`issues/done/` に残さずClose（削除）してもよい
8. 移動または削除時は必ず `issues/index.md` のリンクを更新する

## 新規Issue作成手順

1. 目的が分かるIssue ID（kebab-case）を決める
2. `issues/open/<issue-id>/` を作成する
3. `issues/templates/issue.md` を `README.md` としてコピーする
4. 必須項目を埋める
5. `issues/index.md` の `Open` に1行追加する（優先順は `優先度` 列で管理する）

## AI運用関連Issueの追加ルール

- AI運用文書の更新Issueでは、作業開始時に以下3点を先に報告する
  - 読み込んだルールファイル
  - 今回の作業対象
  - 作業前に守る制約
- 既存 `AGENTS.md` / `CLAUDE.md` / `AI.md` / `.ai/*.md` は上書きせず統合する
- 最終報告で採用方針（採用 / 不採用 / 保留）を明記する

## TODO管理からIssue管理への移行方針

- 旧 `docs/TASK_*.md` / `docs/PROGRESSION.md` の未完了項目は、対応する `issues/open/` Issueへ移管する
- 移管完了後は旧TASK文書を削除し、必要ならGit履歴を参照する
- `docs/` には確定仕様・背景説明・完了済みの設計判断のみ残す
- 新規の進捗更新は `docs/` へ追記せず、必ず対象Issueへ追記する
- 移行後の更新責任者は「対象Issueを実装した作業者」とし、PR時に `issues/index.md` 反映まで行う
- `docs/TODO.md` などタスク管理文書はIssueへ移行後、参照を検索して残存参照がなければ削除する

## Issue本文の必須項目

- 概要（1-3行）
- 背景（なぜ必要か）
- 目的（解決したいこと）
- 実施手順（着手前に決めた進め方）
- スコープ（対応範囲）
- 非スコープ（今回やらないこと）
- 受け入れ条件（完了判定）
- タスク分解（チェックボックス）
- 関連ファイル
- TODO ID連携（コードTODOがある場合）

## 記述ルール

- 1Issueは1目的に絞る
- `関連ドキュメント` は原則1件まで（散乱防止）
- 進捗ログを時系列で増やしすぎない（最新状態を優先）
- TODO IDを使う場合は、Issue本文とコードコメントの両方に同じIDを書く
- 手順書・計画・レビュー観点はIssue本文に記載し、`docs/` に混在させない

## 完了時ルール

1. 受け入れ条件を満たしたことを確認する
2. レビュー指摘の採用分対応とPRマージが完了していることを確認する
3. `issues/done/` へディレクトリ移動してアーカイブする（不要なら削除してClose扱いでもよい）
4. `issues/index.md` の状態を更新する（削除時は該当行を削除する）
5. 不要なコードTODOコメントを削除する
