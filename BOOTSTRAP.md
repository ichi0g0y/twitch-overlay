# BOOTSTRAP

このドキュメントは、Codex / Claude に対して「このリポジトリ準拠で作業する」ための初期手順を示します。

## 目的

- セッション開始時の読み込み漏れを防ぐ
- 実装前にルール・制約・運用フローを揃える
- タスク管理を `issues/` に統一する

## セッション開始時の実行手順（AI向け）

1. 次の順に必読ドキュメントを確認する
   `AGENTS.md` → `AI.md` → `CLAUDE.md` → `.ai/behavior.md` → `.ai/rules.md` → `.ai/workflow.md` → `.ai/project.md`
2. レビュー対応タスクの場合のみ、追加で次を確認する
   `.ai/review.md` / `.ai/dev-env.md` / `.ai/git.md`
3. ルール確認後、着手前に以下を短く報告する
   - 読み込んだファイル
   - 作業対象
   - 守るべき制約（コミット条件、レビュー連携ルールなど）
   - Issue起点 + worktree + 小PRで進めること
4. 実装・検証を実行し、結果を報告する

## AI運用ファイルを更新する場合の手順

1. 以下のAI運用ファイルを必要に応じて更新する
   - `AGENTS.md`
   - `CLAUDE.md`
   - `AI.md`
   - `.ai/*.md`
2. 既存の AI 関連ドキュメント（`AGENTS.md` / `CLAUDE.md` / `AI.md` / `.ai/*.md`）がある場合は、上書きせず差分比較して統合する
3. 最低限次の3点をこのプロジェクト向けに更新する
   - `.ai/project.md`
   - `.ai/rules.md`
   - `.ai/workflow.md`
4. 既存ルールとの衝突点を洗い出し、採用方針（採用 / 不採用 / 保留）を明記する
5. `issues/` を中心に運用する
   - `issues/README.md`
   - `issues/index.md`
   - `issues/templates/issue.md`
   - `issues/open/` / `issues/in-progress/` / `issues/done/`
6. 既存のタスク管理先（`docs/TASK_*.md` / `docs/PROGRESSION.md` など）がある場合は、Issue運用への移行方針を明記する
   - どの情報を `issues/` に移すか
   - `docs/` には何を残すか
   - 移行後の更新責任者
