# レビュー

## 記述ルール

- 指摘にはファイルパス・行番号・根拠を必ず含める
- 「どう直すか」より先に「なぜ問題か」を明確にする
- レビュー結果は日本語で報告する
- レビュー連携の手順は `.ai/workflow.md` を参照する

## 観点（優先順）

1. 正しさ
2. 境界条件
3. エラー処理
4. 並行処理
5. 状態管理
6. 保守性
7. 設計整合性
8. テストカバレッジ

## 出力テンプレート

```markdown
# Review Feedback

- created_at: YYYY-MM-DD HH:MM
- target: <レビュー対象>
- summary: 修正が必要な指摘あり
- findings:
  - High:
    - id: F-01
      location: path/to/file.ext:123
      issue: 問題の内容
      reason: 問題となる技術的理由
      impact: 想定される影響
  - Medium: []
  - Low: []
```
