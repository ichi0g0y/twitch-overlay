# プロジェクト概要

## 目的

Twitch配信向けオーバーレイと印刷連携を、Tauriベースのデスクトップアプリとして運用する。

## 現在の状態

- 技術スタック: Rust（Tauri 2） + TypeScript（`web/` と `frontend/`）
- バックエンド: `src-tauri/` + `crates/`（API/印刷/サーバー制御）
- タスク運用: GitHub Issues 集約（Issue単位worktree + 小PR）
- AI運用: 既存文書を統合更新し、採用方針（採用 / 不採用 / 保留）を報告する

## ディレクトリ構成

- `.ai/`: AI共通ルール
- `.claude/`: Claude用エージェント定義
- `docs/`: 確定仕様・固定資料
- `web/`: オーバーレイUI（Tauri埋め込み対象）
- `frontend/`: Settings画面（Tauriフロント）
- `src-tauri/`: Tauriアプリ本体（axum HTTPサーバ含む）
- `crates/`: Rustワークスペースクレート

## プロジェクト固有の重要制約

- `web/` は単体開発サーバーより、ビルドしてTauri統合確認を優先する
- `frontend/` でAPIアクセスする場合は `GetServerPort()` の動的取得を使う
- Rustテスト時は `DRY_RUN_MODE=true` を必ず設定する
- タスク・手順・レビュー観点の正本は GitHub Issues とし、`docs/` は確定情報のみ保持する
