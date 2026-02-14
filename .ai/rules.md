# 共通ルール

## 原則

- チャット・報告・ドキュメントは日本語で記述する
- `/commit` または `/commit!` が明示されない限り、コミットしない
- 変更は最小差分で行い、既存のプロジェクト固有制約を壊さない
- 自動生成コードは直接編集せず、入力元（定義/スキーマ）を修正して再生成する
- 既存 `AGENTS.md` / `CLAUDE.md` / `AI.md` / `.ai/*.md` は上書きせず統合で更新する
- AI運用文書を更新した場合は、採用方針（採用 / 不採用 / 保留）を報告する

## 実装ルール

- 手順書・計画・レビュー観点は `issues/` に記録し、`docs/` には確定事項を残す
- 将来対応が必要な項目は `issues/index.md` と `issues/open/` にIssue化する
- 新規Issue IDは `api-error-handling` のようなkebab-case（連番なし）で管理する
- コードコメントの TODO は TODO ID と対応Issueをセットで管理する
- `frontend/` のAPIアクセスは `GetServerPort()` を使用し、固定ポートを直書きしない
- `web/` からのAPIアクセスはWails配信前提で相対パスを優先する
- 移植作業ではテンプレート側 `BOOTSTRAP.md` / `docs/guides/AI_INSTRUCTION_PORTING.md` を参照専用で扱い、対象リポジトリへ追加しない
- `docs/TODO.md` などタスク管理文書は `issues/` へ移行後、参照が残っていないことを確認して削除する

## テスト・検証ルール

- Goテストは `DRY_RUN_MODE=true` を付けて実行する
- 検証で生成した不要バイナリは削除する

## 品質ルール

- 1ファイル300行超を目安に分割を検討する
- 1関数100行超を目安に責務分割を検討する
- レビュー依頼時はIssueを `issues/review-waiting/` へ移し、修正が必要なら `issues/in-progress/` へ戻す
- 修正なしレビュー完了時はPRマージ後に `issues/done/` へ移動するか、記録不要ならIssueをClose（削除）してよい
