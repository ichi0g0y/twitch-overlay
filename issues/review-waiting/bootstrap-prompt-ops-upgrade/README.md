# bootstrap-prompt-ops-upgrade BOOTSTRAP準拠のAI運用アップグレード

- 状態: Review Waiting
- 優先度: 高
- 担当: 未定
- 期限: 未定

## 概要

最新のBOOTSTRAPプロンプト方針に合わせて、`issues/` 運用とレビュー時動作を中心にAI運用定義を更新する。

## 背景

現行ルールはIssue運用の基礎は整備済みだが、作業開始時の初動報告、移植時の採用方針報告、`/review-verify` の判定・実行手順が十分に明文化されていない。

## 目的

BOOTSTRAPで要求される運用を、既存ドキュメントを壊さず統合し、実務で再現可能な手順として固定する。

## 実施手順

1. BOOTSTRAP要件と現行 `.ai/*.md` / `AI.md` / `issues/*` の差分を整理する
2. `.ai/project.md` / `.ai/rules.md` / `.ai/workflow.md` / `.ai/review.md` / `.ai/behavior.md` を更新する
3. `AI.md` と `issues/` テンプレートに必要な運用補足を反映する
4. 採用方針（採用 / 不採用 / 保留）を報告する

## スコープ

- AI運用ドキュメント更新
- Issueテンプレートおよび運用ガイド更新
- レビュー/`/review-verify` 手順強化

## 非スコープ

- アプリ本体コードの機能実装
- 既存Issueの内容刷新

## 受け入れ条件

1. BOOTSTRAP準拠の初動手順と事前報告フォーマットが明記されている
2. `issues/` 集約・Issue単位worktree・1Issue 1PR運用が明文化されている
3. `/review-verify` の分類・実施・クローズ手順が明記されている
4. 既存 `AGENTS.md` / `CLAUDE.md` / `AI.md` / `.ai/*.md` を上書きせず統合方針で更新されている

## タスク分解

- [x] 差分要件整理
- [x] `.ai` ドキュメント更新
- [x] `issues` 運用ドキュメント更新
- [x] 最終検証と報告

## レビュー観点

- BOOTSTRAP要件が漏れなく運用手順へ反映されているか
- 既存プロジェクト固有制約を毀損していないか

## 採用方針

- 採用:
  - 作業開始時の先出し報告（読込ルール/作業対象/作業前制約）
  - `issues/` 集約運用の明文化強化
  - `/review-verify` の分類報告（採用/不採用/追加情報必要）
  - 既存文書の統合更新ルール（上書き禁止）
- 不採用:
  - なし
- 保留:
  - テンプレート側 `BOOTSTRAP.md` / `docs/guides/AI_INSTRUCTION_PORTING.md` の本文同期方法は外部参照のため運用監視

## TODO ID連携

- なし

## 関連ファイル

- `.ai/rules.md`
- `.ai/workflow.md`
- `.ai/review.md`
- `.ai/behavior.md`
- `AI.md`
- `issues/README.md`
- `issues/templates/issue.md`
- `issues/index.md`

## 関連ドキュメント

- `AGENTS.md`
