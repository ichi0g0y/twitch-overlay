---
title: "Issue固定タスク"
read_only: false
type: "command"
argument-hint: "[issue-number]"
---

# Issue固定（/pick）

## 目的

対象Issueを `.context/current_issue` に保存し、既存Issue継続時の作業対象を明示する。

## 実行手順

1. 引数（Issue番号）の有無を確認する。
2. 引数がある場合:
   - Issueの存在を確認する（手段は固定しない。例: `gh issue view <issue-number>` / GitHub REST API / GraphQL API）。
   - 最初に選んだ手段が使えない場合は、別手段に切り替えて確認する。
   - 存在確認に失敗した場合は `.context/current_issue` を更新せずに中断し、その旨をユーザーへ報告する。
   - 既存の `.context/current_issue` があっても、ユーザー明示指示として引数のIssue番号で上書き保存する。
3. 引数がない場合:
   - 既存の `.context/current_issue` の有無を確認する。
   - 既存ファイルがある場合は、既存スコープがある旨を警告し、上書きしてよいかユーザーに確認する。
   - ユーザーが上書きを拒否した場合は `.context/current_issue` を変更せずに終了する。
   - Open Issue を優先度順（`P0 -> P1 -> P2 -> P3 -> 優先度なし`）で候補取得する。
   - 候補が0件なら、その旨をユーザーへ報告して終了する（新規Issue起票は行わない）。
   - 最上位が1件ならそのIssue番号を設定する。
   - 複数候補ならユーザーに選択を求める。
4. 設定結果を報告する（Issue番号と現在ブランチ名）。

## ルール

- `/pick` は任意コマンド。未実行でも通常動作は可能。
- `.context/current_issue` はIssue番号のみを保存する。
- `current_issue` の上書きは、`/pick <issue-number>` の明示指示時（存在確認成功時）か、引数なし `/pick` でユーザーが上書きに同意した場合のみ行う。
- 引数あり（`/pick <issue-number>`）はユーザー明示指示として、確認なしで上書きしてよい。
- 引数なしで既存スコープを変更する場合は、ユーザー確認なしで上書きしない。
- 共有ライブラリ変更を伴う場合は、影響先Issueと `Refs #...` で相互に記載する。
