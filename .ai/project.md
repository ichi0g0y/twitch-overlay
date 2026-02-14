# プロジェクト概要

## 目的

Twitch配信向けオーバーレイと印刷連携を、Wailsベースのデスクトップアプリとして運用する。

## 現在の状態

- 技術スタック: Go + Wails + TypeScript（`web/` と `frontend/`）
- 並行実装: Tauri/Rust移行関連コード（`src-tauri/`, `crates/`）
- バックエンド: `internal/`（API/印刷/サーバー制御）
- タスク運用: `issues/` 集約（Issue単位worktree + 小PR）
- AI運用: 既存文書を統合更新し、採用方針（採用 / 不採用 / 保留）を報告する

## ディレクトリ構成

- `.ai/`: AI共通ルール
- `.claude/`: Claude用エージェント定義
- `docs/`: 確定仕様・固定資料
- `issues/`: 揮発タスク、実装計画、レビュー観点
- `web/`: オーバーレイUI（Wails埋め込み対象）
- `frontend/`: Settings画面（Wailsフロント）
- `internal/`: Goバックエンド
- `src-tauri/`, `crates/`: Tauri/Rust実装

## プロジェクト固有の重要制約

- `web/` は単体開発サーバーより、ビルドしてWails統合確認を優先する
- `frontend/` でAPIアクセスする場合は `GetServerPort()` の動的取得を使う
- Goテスト時は `DRY_RUN_MODE=true` を必ず設定する
- タスク・手順・レビュー観点の正本は `issues/` とし、`docs/` は確定情報のみ保持する
