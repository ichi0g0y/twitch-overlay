# レビュー

## 記述ルール

- 指摘にはファイルパス・行番号・根拠を必ず含める
- 「どう直すか」より先に「なぜ問題か」を明確にする
- レビュー結果は日本語で報告する
- レビュー連携手順は `.ai/workflow.md` を参照する
- バグ・回帰リスク・テスト不足の順で優先して指摘する
- 指摘なしの場合は「修正不要」を明記し、Issueを `Review Waiting` 維持のままPRマージ後に `Done/Close` とする

## 観点（優先順）

1. 正しさ
2. 境界条件
3. エラー処理
4. 並行処理
5. 状態管理
6. APIポートの扱い（`GetServerPort()` / 相対パス）
7. 印刷安全性（`DRY_RUN_MODE` や副作用）
8. テストカバレッジ

## `.context/_review_feedback.md` の必須項目

- `created_at`: 作成日時
- `target`: レビュー対象（コミット/PR/ブランチ）
- `summary`: 総評
- `findings`: 重要度別の指摘一覧
- 各指摘の必須情報:
  - `id`
  - `location`（ファイルパス + 行番号）
  - `issue`
  - `reason`
  - `impact`
  - `repro`（再現条件または成立条件）

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
      repro: 再現条件や成立条件
  - Medium: []
  - Low: []
```

## `/review-verify` 実施時の分類出力

`/review-verify` の報告では、最低限次の3分類を含める。

- 採用: 修正した指摘ID
- 不採用: 採用しない理由つき指摘ID
- 追加情報必要: 追加確認が必要な指摘ID
