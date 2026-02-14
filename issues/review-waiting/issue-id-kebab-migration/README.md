# issue-id-kebab-migration Issue ID命名のkebab-case移行

- 状態: Review Waiting
- 優先度: 中
- 担当: 未定
- 期限: 未定

## 概要

既存の `ISSUE-xxxx` 形式Issueを、kebab-case命名へ段階的に移行する。

## 背景

運用ルールは新規Issueをkebab-case（連番なし）へ更新したが、既存Issueは連番形式のまま残っている。

## 目的

Issue命名規則を新旧混在から一本化し、運用の判断コストを下げる。

## 作業前に守る制約

- 既存Issue本文の内容は改変せず、IDと参照パスの整合性を優先する
- `issues/index.md` と関連参照のリンク切れを残さない

## 実施手順

1. 既存 `ISSUE-xxxx-*` ディレクトリの移行対象一覧を作成する
2. kebab-caseの新IDへディレクトリ名と見出しを更新する
3. `issues/index.md` と相互参照を更新する
4. リンク切れチェックを実施する

## スコープ

- `issues/open/` / `issues/in-progress/` / `issues/done/` の既存連番Issue
- `issues/index.md` のID表記

## 非スコープ

- 各Issueの実装内容の見直し
- アプリコード変更

## 受け入れ条件

1. 連番Issueが残っていない
2. 参照リンク切れがない
3. `issues/index.md` のID表記がすべてkebab-caseで統一されている

## タスク分解

- [x] 移行対象一覧作成
- [x] ディレクトリ移行
- [x] 参照更新
- [x] リンク検証

## レビュー観点

- ディレクトリ移動漏れがないか
- 参照切れや誤リンクがないか

## TODO ID連携

- なし

## 関連ファイル

- `issues/index.md`
- `issues/README.md`

## 関連ドキュメント

- `AI.md`
