# ISSUE-0002 docs/TASK群からissues管理への移行

- 状態: In Progress
- 優先度: 高
- 担当: 未定
- 期限: 未定

## 概要

`docs/TASK_*.md` と `docs/PROGRESSION.md` に散在する未完了タスク・手順・レビュー観点をIssueへ移行する。

## 背景

現状は `docs/` に実装タスクが残っており、作業の正本が分散している。
Issue単位worktree + 小PR運用と整合しないため、更新漏れや追跡性低下のリスクがある。

## 目的

タスクの正本を `issues/` に一本化し、`docs/` は確定情報のみ保持する状態へ移行する。

## 実施手順

1. `docs/TASK_*.md` から未完了項目のみ抽出する
2. 項目をIssue単位に再分割して `issues/open/` に作成する
3. `issues/index.md` を更新する
4. 元ドキュメントには「移行先Issue」リンクだけ残す

## スコープ

- `docs/TASK_A_*.md` 〜 `docs/TASK_L_*.md`
- `docs/PROGRESSION.md`
- `docs/TAURI_SPRINT_PLAN_2026-02-12.md`

## 非スコープ

- 仕様書としての `docs/PRESENT.md` 更新
- 実装コード変更

## 受け入れ条件

1. 未完了タスクがすべて `issues/open/` または `issues/in-progress/` に存在する
2. `docs/` 側に残るのは確定仕様と移行リンクのみとなる
3. 以後の進捗更新先が `issues/` に統一される

## タスク分解

- [x] 未完了タスクの棚卸し
- [x] Issueへの再分割・採番
- [x] `issues/index.md` 反映
- [x] `docs/` 側への移行先リンク追記
- [ ] `docs/` 本文のスリム化（確定情報のみ残す範囲を個別判断）

## レビュー観点

- 漏れなく移行できているか
- Issue粒度が1PR単位になっているか

## TODO ID連携

- なし

## 関連ファイル

- `issues/index.md`
- `docs/PROGRESSION.md`
- `docs/TASK_A_COMPAT_VALIDATION.md`
- `docs/TASK_L_HEADLESS_FINISH.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
