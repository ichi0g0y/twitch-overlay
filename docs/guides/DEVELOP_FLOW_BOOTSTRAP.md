# mainデフォルト + develop運用 導入ガイド

このガイドは、`main` をデフォルトブランチのまま維持しつつ、日常開発を `develop` へ集約する運用を導入するための手順です。

参照元:
- <https://github.com/ichi0g0y/agentic-boilerplate-seed/tree/main/docs/guides/DEVELOP_FLOW_BOOTSTRAP.md>

## 導入する仕様

1. `develop` へのPRマージ時に `Closes/Fixes/Resolves #...` を解析してIssueを自動クローズする
2. Issue参照を含む同PRへ `release:pending` ラベルを付与する
3. `main` への `develop` リリースPRマージ時に `release:pending` を除去する
4. develop向けPR本文で `Closes/Fixes/Resolves` と `Refs` を使い分ける

## 前提

- デフォルトブランチが `main`
- `develop` ブランチが存在する
- リポジトリでGitHub Actionsが有効
- リポジトリ管理者権限がある

## Step 1. ラベル運用

- 必須ラベル: `release:pending`
  - 説明: `Merged to develop but not yet released to main`
  - 色: `BFD4F2`（推奨）
- 任意ラベル: `released:vX.Y`

補足:
- `close-issues-on-develop-merge.yml` は、ラベル未作成時に自動で `release:pending` を作成します。

## Step 2. ブランチ保護

`main` ブランチで以下を設定します。

1. direct push禁止
2. PR経由のみ変更可能
3. 必要なら必須status checksを設定

## Step 3. developマージ時Action

ファイル: `.github/workflows/close-issues-on-develop-merge.yml`

動作:
- `pull_request.closed` かつ `base=develop` かつ `merged=true` で実行
- PR本文から `Closes/Fixes/Resolves #<number>` を抽出
- 対象Issue（PRではないIssue）のみ `closed` に更新
- 対象Issue参照がある場合のみ、マージされたPRへ `release:pending` を付与

## Step 4. mainマージ時Action

ファイル: `.github/workflows/mark-released-on-main-merge.yml`

動作:
- `pull_request.closed` かつ `base=main` かつ `merged=true` で実行
- さらに `head.ref == develop` のリリースPRだけ対象
- リリースPRに含まれるコミットから関連PRを逆引き
- 対象PRから `release:pending` を除去
- `RELEASE_LABEL`（`Repository Variables`）が空でなければ `released:vX.Y` などを追加付与

制約:
- `merge commit` 運用のほうが追跡精度が高い
- `squash/rebase` 混在時は、リリースPR本文に対象PR番号一覧を固定出力する運用を推奨

## Step 5. PR運用ルール

develop向けfeature PR本文では、Issue状態に応じてキーワードを使い分けます。

- 完了させるIssue: `Closes #123` / `Fixes #123` / `Resolves #123`
- 継続中・関連Issue: `Refs #456`

本テンプレートでは `.github/pull_request_template.md` に `Closes #<issue-number>` と `Refs #<issue-number>` を含めています。

## Step 6. mtm導線の導入（必須）

`develop -> main` のリリースPRは、次の導線を必須で使用します。

- `.claude/commands/merge-to-main.md` を追加
- `.claude/commands/mtm.md` を追加
- `base=main`, `head=develop` のPR作成/再利用を標準導線化

## Step 7. 検証チェックリスト

- [ ] developマージでIssueが自動クローズされる
- [ ] developマージでIssue参照があるPRに `release:pending` が付与される
- [ ] develop -> main リリースPRマージで `release:pending` が除去される
- [ ] mainへのdirect pushが禁止されている

## Step 8. ロールバック

障害時は次の順で段階的に停止します。

1. `mark-released-on-main-merge` を停止
2. `close-issues-on-develop-merge` を停止
3. 一時的に手動運用へ退避（Issue手動クローズ、ラベル手動更新）
