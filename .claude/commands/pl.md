---
title: "計画・Issue起票タスク"
read_only: false
type: "command"
---

# 計画作成とIssue起票（/pl）

## 短縮コマンド宣言

- `/pl` は `/plan` の短縮コマンド。
- 挙動・判断基準は `.claude/commands/plan.md` に準拠する。

## 目的

`/plan` と同等に、計画承認後の Issue 自動作成と `.context` 保存まで完了させる。

## 実行ルール

- 詳細仕様は `.claude/commands/plan.md` に従う。
- `GitHub CLI` 事前確認、計画提示、承認取得、Issue作成、`.context/issue_scope.json` 更新まで実行する。
- 実装・コミットは行わない。
