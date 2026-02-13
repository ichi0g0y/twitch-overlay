# ワークフロー

## AI協調フロー

- Codex / Claude の役割は固定しない
- `.context/tasks` は使用しない
- レビュー連携は `.context/_review_feedback.md` のみを使う

## 基本フロー

### 1. 実装

1. ユーザー指示に沿って実装する
2. 必要なテストや検証を実行する
3. 実装内容と検証結果を報告する

### 2. レビュー

1. 変更差分をレビューする（観点は `.ai/review.md` を参照）
2. 修正点がある場合は、先に `.context/_review_feedback.md` を作成する（テンプレートは `.ai/review.md` を参照）
3. その後レビュー結果を報告する
4. 修正点がない場合は `.context/_review_feedback.md` を作成しない
5. 報告時に `.context/_review_feedback.md` の出力有無を明記する

### 3. `/review-verify`

1. `.context/_review_feedback.md` の有無を確認する
2. 指摘を採用/不採用/追加情報必要に分類する
3. 採用した指摘のみ修正する
4. 必要なテストや検証を実行する
5. すべての修正・テストが完了したら `.context/_review_feedback.md` を削除する
6. 結果を報告する

## TODO管理

- 将来実装項目は `docs/TODO.md` に記録する
- コードコメントの TODO は TODO ID とセットで管理する
