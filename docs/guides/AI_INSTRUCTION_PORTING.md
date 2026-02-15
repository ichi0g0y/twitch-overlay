# AI指示ファイル移植ガイド

このテンプレートのAI運用ルールを別リポジトリへ移植するための手順です。

## 対象ファイル

- `AGENTS.md`
- `CLAUDE.md`
- `AI.md`
- `.ai/*.md`
- `.claude/commands/*.md`

## 移植対象外ファイル（原則）

- `BOOTSTRAP.md`
- `docs/guides/AI_INSTRUCTION_PORTING.md`
- 理由: いずれもテンプレート側の導入手順・参照資料であり、対象リポジトリの常設運用ファイルではないため

## 移植手順

1. 対象リポジトリに上記ファイルを配置する
2. 既存の AI 関連ドキュメント（`AGENTS.md` / `CLAUDE.md` / `AI.md` / `.ai/*.md`）がある場合は、上書きせず差分比較して統合する
3. 衝突したルールは採用方針（採用 / 不採用 / 保留）を明記する
4. `.ai/project.md` をプロジェクト内容に合わせて更新する
5. `.ai/rules.md` に言語・フレームワーク固有ルールを追加する
6. `.ai/workflow.md` のコマンド例を実運用に合わせて更新する
7. Claude Code を使う場合は `.claude/commands/` を配置し、`/plan` / `/pl`（承認後Issue自動作成）と `/pick` / `/p` / `/review-verify [issue-number]` / `/rv [issue-number]` / `/merge [pr-number]` / `/m [pr-number]` / `/commit` / `/c` / `/commit!` / `/c!` を有効化する
8. Codex を使う場合は Slash Command が使えないため、同等処理をプロンプトで指示する運用を明記する
9. 必要に応じて `.context/issue_scope.json` を使う運用（`primary_issue` / `related_issues` / `pr_number` の保持）を明記する
10. GitHub操作を `gh` で行う場合は `scripts/ghx` を採用し、`bash scripts/setup_envrc.sh` と `direnv` 前提をドキュメント化する
11. 既存のタスク管理資料（`docs/TODO.md` など）がある場合は、GitHub Issues運用に移行する
12. 旧タスク管理資料への参照が残っていないことを確認する（`README.md` / `docs/` / `AGENTS.md` など）
13. 移行完了した旧タスク管理資料（`docs/TODO.md` など）を削除する
14. 移植後に以下が満たされることを確認する
    - 修正内容・進行状況・手順書・計画・レビュー観点が GitHub Issues に集約されている
    - Issue単位でworktreeを作成する運用になっている
    - 小さなPRを順次適用する方針が明文化されている
    - `gh` を使う場合は `scripts/ghx ...` を使う運用が、PR操作とレビューコメント記録に適用されている

## 注意点

- 既存プロダクト固有の制約はそのまま流用しない
- ローカル絶対パスを含む設定は削除する
- `/commit` / `/c` と `/commit!` / `/c!` の運用ルールは全リポジトリで統一する
- `docs/` は確定情報の保管先とし、揮発タスクを混在させない
