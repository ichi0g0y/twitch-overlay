# プロジェクト概要

## 目的

Twitch配信用のオーバーレイアプリケーション。Wailsフレームワークで統合されたGoバックエンドとフロントエンド構成。

## 現在の状態

- 技術スタック: Go (Wails) + TypeScript (Vite)
- 実装対象: Twitchオーバーレイ（配信支援）
- 主要機能: Twitch EventSub連携、サーマルプリンター印刷、音楽プレイヤー

## ディレクトリ構成

- **`web/`** - オーバーレイ用フロントエンド（Vite + TypeScript）
- **`frontend/`** - Wails Settings画面用フロントエンド
- **`internal/`** - Goバックエンド（Webサーバー、API、プリンター制御）
- **`cmd/`** - エントリーポイント
- **`.ai/`** - AI共通ルール
- **`.claude/`** - Claude用コマンド
- **`docs/`** - プロジェクト文書
- **`.context/`** - エージェント間の共有作業領域

## 元プロジェクト

- `../twitch-overlay` をベースにWails化されたもの
- 元プロジェクト: `/Users/toka/Abyss/twitch-overlay/`
- プリンター関連やTwitch連携は元プロジェクトの実装を参照すること

## 関連ドキュメント

- 構成と開発フロー: [`.ai/project-structure.md`](.ai/project-structure.md)
- 運用ガイドライン: [`.ai/project-guidelines.md`](.ai/project-guidelines.md)
- フロントエンド開発: [`.ai/frontend.md`](.ai/frontend.md)
- Goテスト方針: [`.ai/go-test.md`](.ai/go-test.md)
