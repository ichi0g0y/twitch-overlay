# レビュー

## 記述ルール

- 指摘にはファイルパス・行番号・根拠を必ず含める
- 「どう直すか」より先に「なぜ問題か」を明確にする
- レビュー結果は日本語で報告する
- レビュー連携手順は `.ai/workflow.md` を参照する

## 観点（優先順）

1. 正しさ
2. 境界条件
3. エラー処理
4. 並行処理
5. 状態管理
6. APIポートの扱い（`GetServerPort()` / 相対パス）
7. 印刷安全性（`DRY_RUN_MODE` や副作用）
8. テストカバレッジ

## 出力テンプレート

```markdown
# Review Feedback

- created_at: 2026-02-14 10:00
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
