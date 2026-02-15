# レビュー

## 記述ルール

- 指摘にはファイルパス・行番号・根拠を必ず含める
- 「どう直すか」より先に「なぜ問題か」を明確にする
- レビュー結果は日本語で報告する
- レビュー結果は対象 GitHub Issue のコメントに記録する
- レビュー開始前に、`.context/issue_scope.json` と `scripts/ghx issue view <issue-number> --comments` で対象Issueの本文・既存コメントを確認する
- レビュー連携の手順は `.ai/workflow.md` を参照する
- `gh` を使ってレビュー結果を Issue に記録する場合は `scripts/ghx issue comment ...` を使う

## 観点（優先順）

1. 正しさ
2. 境界条件
3. エラー処理
4. 並行処理
5. 状態管理
6. APIポート運用（`GetServerPort()` / 相対パス）
7. 印刷安全性（`DRY_RUN_MODE` と副作用）
8. テストカバレッジ

## 出力テンプレート

```markdown
## Review Feedback

- issue: #<issue-number>
- summary: 修正が必要な指摘あり
- findings:
  - id: F-01
    severity: High
    location: path/to/file.ext:123
    issue: 問題の内容
    reason: 問題となる技術的理由
    impact: 想定される影響
    decision: 採用 / 不採用 / 追加情報必要
```
