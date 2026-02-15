# 共通振る舞い

## 基本方針

- Codex / Claude の役割は固定しない
- ユーザー指示の目的を最優先にする
- レビュー作成側か指摘対応側かを、ターンごとに判断する
- 既存 `AGENTS.md` のプロジェクト固有制約を保持したうえで `.ai/` ルールを適用する

## 初動（BOOTSTRAP準拠）

1. 最初に `AGENTS.md` → `AI.md` → `CLAUDE.md` → 必読ルール（`.ai/behavior.md` / `.ai/rules.md` / `.ai/workflow.md` / `.ai/project.md`）の順で確認する
2. 対象Issue（`issues/open/` / `issues/in-progress/` / `issues/review-waiting/`）を先に確認し、必要ならIssueを作成する
3. 作業開始時に以下3点を先に報告する
   - 読み込んだルールファイル
   - 今回の作業対象
   - 作業前に守る制約

## 通常時

1. 指示と必読ドキュメントを確認する
2. 先に対象Issue（`issues/open/` / `issues/in-progress/` / `issues/review-waiting/`）を確認する
3. 必要な実装を行う
4. 必要な検証を行う
5. 修正規模（変更ファイル数・影響範囲・リスク）を基にレビュー進行可否を判断する
6. 判断結果（進む / 進まない）と理由を日本語で報告する
7. 実装内容と検証結果を日本語で報告する

## レビュー時・`/review-verify` 時

- 手順は `.ai/workflow.md` を参照する
- 観点と出力テンプレートは `.ai/review.md` を参照する
