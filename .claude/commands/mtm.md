---
title: "main反映PRタスク"
read_only: false
type: "command"
argument-hint: "[--no-merge] [release-label]"
---

# main反映PR作成（/mtm）

## 短縮コマンド宣言

- `/mtm` は `/merge-to-main` の短縮コマンド。
- 挙動・判断基準は `.claude/commands/merge-to-main.md` に準拠する。

## 実行ルール

- `base=main` / `head=develop` のPR作成（または既存PR再利用）を行う。
- `develop -> main` 反映時は本コマンド（または `/merge-to-main`）を必須で利用する。
- `--no-merge` がない限り、PRは作成/更新後にマージまで行う。
- `.context/issue_scope.json` を使う場合は `pr_number` / `pr_url` を更新する。
