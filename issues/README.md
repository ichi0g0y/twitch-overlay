# Issues 運用ガイド

`issues/` は、揮発的な実装タスクを管理する専用ディレクトリです。
固定知識（仕様や方針）は `docs/`、未完了タスクは `issues/` に分離します。

## ディレクトリ構成

- `issues/index.md`: 全Issueの一覧（状態別）
- `issues/templates/issue.md`: Issue記入テンプレート
- `issues/open/`: 未着手Issue
- `issues/in-progress/`: 進行中Issue
- `issues/done/`: 完了Issue

## 命名規則

- Issue ID: `ISSUE-0001` 形式（4桁連番）
- Issueディレクトリ名: `ISSUE-0001-short-kebab-case`
- Issue本文: 各Issueディレクトリの `README.md`
- コード内TODO ID: `abc123` 形式（6文字英数字）

## 状態遷移

1. 作成時は `issues/open/` に配置する
2. 着手したら `issues/in-progress/` に移動する
3. 完了したら `issues/done/` に移動する
4. 移動時は必ず `issues/index.md` のリンクを更新する

## 新規Issue作成手順

1. `issues/index.md` を見て次のIssue IDを採番する
2. `issues/open/ISSUE-xxxx-<slug>/` を作成する
3. `issues/templates/issue.md` を `README.md` としてコピーする
4. 必須項目を埋める
5. `issues/index.md` の `Open` に1行追加する

## TODO管理からIssue管理への移行方針

- `docs/TASK_*.md` / `docs/PROGRESSION.md` のうち、未完了の手順・計画・レビュー観点はIssueへ移す
- `docs/` には確定仕様・背景説明・完了済みの設計判断のみ残す
- 新規の進捗更新は `docs/` へ追記せず、必ず対象Issueへ追記する
- 移行後の更新責任者は「対象Issueを実装した作業者」とし、PR時に `issues/index.md` 反映まで行う

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
2. `issues/done/` へディレクトリ移動する
3. `issues/index.md` の状態を更新する
4. 不要なコードTODOコメントを削除する
