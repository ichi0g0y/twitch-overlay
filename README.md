# twitch-overlay

Twitchカスタムリワードと連携した配信用オーバーレイシステム

> **📝 利用について**
> このプロジェクトは個人の配信環境向けにカスタマイズされています。
> 時計の表示内容等に個人設定が含まれているため、技術実装の参考として、または改造ベースとしてご活用ください。

**主要機能**: Twitchリワード連携 | FAX風画像表示 | カスタマイズ可能時計 | サーマルプリンター印刷 | デスクトップアプリ

## 概要

Rust（Tauri 2）とReact/TypeScriptを使用したデスクトップアプリケーションです。配信用オーバーレイとプリンター制御を統合し、よりシンプルなセットアップと管理を実現しています。

## 機能

- **Twitchカスタムリワード連携**: チャンネルポイント報酬の自動印刷
- **FAX風演出**: 受信した画像をFAX風に表示・印刷
- **統計情報表示**: リアルタイムで更新される各種統計
- **カスタム時計**: 配信画面用のカスタマイズ可能な時計
- **Settings画面**: Tauriアプリ内蔵の設定管理UI
- **WebSocketリアルタイム通信**: オーバーレイとの双方向通信
- **音楽プレイヤー**: BGM再生機能（ビジュアライザー付き）
- **抽選イベント**: サブスクボーナス付きルーレット抽選

## 必要要件

- Rust / Cargo
- Tauri CLI v2 (`cargo install tauri-cli`)
- Node.js 20以上 / Bun
- [Task](https://taskfile.dev/)（タスクランナー）
- Bluetooth対応サーマルプリンター（Cat Printer）
- macOS / Linux / Windows

## セットアップ

### 1. リポジトリをクローン
```bash
git clone https://github.com/ichi0g0y/twitch-overlay.git
cd twitch-overlay
```

### 2. 依存関係をインストール
```bash
# Tauri CLIのインストール（未インストールの場合）
cargo install tauri-cli

# フロントエンド依存関係
task install
```

### 3. 起動
```bash
# Tauriデスクトップアプリとして起動（推奨）
task dev

# プロダクションビルド
task build
```

## 開発

### プロジェクト構成
- **`src-tauri/`** - Tauriアプリ本体（Rust）
- **`crates/`** - Rustワークスペースクレート（catprinter, image-processor, overlay-db, twitch-client, word-filter）
- **`web/`** - OBSオーバーレイ用フロントエンド（ビルド後Tauriに組み込み）
- **`frontend/`** - Settings画面用フロントエンド（Dashboard）

### 開発コマンド
```bash
# Tauriデスクトップアプリとして起動（フロントエンドビルド含む）
task dev

# ヘッドレスサーバー起動（フロントエンドは事前ビルド前提）
task dev:quick

# オーバーレイのビルド
cd web && bun run build

# テストの実行
task test
```

### 音声認識/翻訳（ブラウザ）
- **音声認識**: Chromeの Web Speech API（`webkitSpeechRecognition`）
- **翻訳**: Chromeの Translator API（ブラウザ内蔵。外部API/GASは使用しません）
- **送信/操作ページ**: `http://localhost:[動的ポート]/`（ダッシュボードでマイク入力と翻訳を実行）
- **表示ページ**: `http://localhost:[動的ポート]/overlay/`（原文/翻訳を表示）
- 設定はSQLite（Settings画面）に保存されます（翻訳言語コードは `en`, `zh`, `zh-Hant` などChrome向け）

### オーバーレイの開発フロー
1. `web/`ディレクトリで変更を行う
2. `cd web && bun run build`でビルド
3. `task dev`でTauriアプリとして動作確認
4. オーバーレイは`http://localhost:[動的ポート]/overlay/`でアクセス可能

## 設定管理

すべての設定はTauriアプリケーションのSettings画面から行います。環境変数ファイル（.env）は不要です。

### Twitch認証

1. アプリケーションを起動
2. Settings画面を開く
3. Twitch設定タブで認証を実行
4. ブラウザでTwitchアカウントにログイン

### 主な設定項目

Settings画面で以下の設定が可能です：

- **Twitch設定**: クライアントID、シークレット、ユーザーID、カスタムリワードID
- **プリンター設定**: MACアドレス、画質、回転、KeepAlive機能
- **一般設定**: サーバーポート、タイムゾーン、時計表示
- **開発者設定**: DRY_RUNモード、デバッグ出力

## タスク管理（Taskfile）

主要なタスクコマンド:
- `task dev` - Tauriデスクトップアプリとして起動（既定）
- `task dev:quick` - ヘッドレスサーバー起動（フロントエンドは事前ビルド前提）
- `task build` - プロダクションビルド
- `task test` - テスト実行（`DRY_RUN_MODE=true`）
- `task install` - フロントエンド依存関係インストール
- `task clean` - ビルドファイルクリーンアップ

## トラブルシューティング

### Bluetooth権限エラー（Linux）
```bash
# bluetoothグループに追加
sudo usermod -a -G bluetooth $USER
# 再ログインが必要
```

### プリンターが見つからない
1. プリンターの電源確認
2. MACアドレスの確認
3. Settings画面のプリンタータブから「デバイススキャン」を実行

### オーバーレイが表示されない
1. `cd web && bun run build`でオーバーレイをビルド
2. `task dev`でアプリを再起動
3. Settings画面でポート設定を確認

## ライセンス

MIT
