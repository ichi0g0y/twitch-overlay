# Getting Started

## 1. 目的を定義する

- 何を作るか（対象ユーザー / ユースケース）
- 何を作らないか（スコープ外）
- 最初の到達点（MVP）

## 2. AI運用ルールを確認する

- `.ai/rules.md`
- `.ai/workflow.md`
- `.ai/review.md`
- `.ai/dev-env.md`
- 認証状態確認 を実行して、GitHub操作が可能な状態か確認する

## 3. 技術選定前にやること

- 要件整理
- 画面・API・データのラフ設計
- `/plan` / `/pl` で計画提示（計画のみ）
- Issue化が必要なら、指示またはIssue番号明示の後にIssue作成と `.context/current_issue` 更新を行う
- 優先度ラベル定義（`priority:P0` / `P1` / `P2` / `P3`）
- 必要なら `/pick` / `/p` を使ったIssue固定（`.context/current_issue`）を準備する（引数なし時は priority順の自動選定が可能）
- Issue単位でworktreeを分ける運用準備
- 小さなPRを順次適用する前提で作業を分割

## 4. 技術選定後にやること

- 開発コマンドを定義
- テスト方針を定義
- 生成物やビルド成果物の運用ルールを定義
