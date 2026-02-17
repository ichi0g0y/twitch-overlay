---
title: "計画準備タスク"
read_only: true
type: "command"
---

# 計画準備（/pl）

## 短縮コマンド宣言

- `/pl` は `/plan` の短縮コマンド。
- 挙動・判断基準は `.claude/commands/plan.md` に準拠する。

## 目的

実装前に、AIを計画準備状態へ遷移させる。

## 実行ルール

- `AI.md` と `.ai/*` の必読ルールを読み込む。
- 認証状態確認 を実行し、GitHub操作可能か確認する。
- `.context/issue_scope.json` があれば状態確認に利用する。
- 現在状態と次の1手を提示し、実装やIssue作成は行わない。
