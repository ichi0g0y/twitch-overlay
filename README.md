# twitch-overlay

Twitchカスタムリワードと連携した配信用オーバーレイシステム（Wails版）

> **📝 利用について**
> このプロジェクトは個人の配信環境向けにカスタマイズされています。
> 時計の表示内容等に個人設定が含まれているため、技術実装の参考として、または改造ベースとしてご活用ください。

**主要機能**: Twitchリワード連携 | FAX風画像表示 | カスタマイズ可能時計 | サーマルプリンター印刷 | デスクトップアプリ

## 概要

Go言語とReact/TypeScriptを使用したデスクトップアプリケーションです。配信用オーバーレイとプリンター制御を統合し、よりシンプルなセットアップと管理を実現しています。

## 機能

- **Twitchカスタムリワード連携**: チャンネルポイント報酬の自動印刷
- **FAX風演出**: 受信した画像をFAX風に表示・印刷
- **統計情報表示**: リアルタイムで更新される各種統計
- **カスタム時計**: 配信画面用のカスタマイズ可能な時計
- **Settings画面**: Wailsアプリ内蔵の設定管理UI
- **WebSocketリアルタイム通信**: オーバーレイとの双方向通信
- **音楽プレイヤー**: BGM再生機能（ビジュアライザー付き）

## 必要要件

- Go 1.21以上
- Node.js 20以上 / Bun
- Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
- Bluetooth対応サーマルプリンター（Cat Printer）
- macOS / Linux / Windows

## セットアップ

### 1. リポジトリをクローン
```bash
git clone https://github.com/yourusername/twitch-overlay.git
cd twitch-overlay
```

### 2. 依存関係をインストール
```bash
# Wails CLIのインストール（未インストールの場合）
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# フロントエンド依存関係
cd frontend && bun install && cd ..
cd web && bun install && cd ..
```

### 3. ビルド
```bash
# 開発ビルド（ホットリロード付き）
task dev

# プロダクションビルド
task build:all
```

## 開発

### プロジェクト構成
- **`web/`** - オーバーレイ用フロントエンド（ビルド後Wailsに埋め込み）
- **`frontend/`** - Wails Settings画面用フロントエンド
- **`internal/`** - Goバックエンド（API、プリンター制御等）
- **`mic-recog/`** - 音声認識（Whisper）サブプロジェクト

### 開発コマンド
```bash
# Wails開発モード（統合開発環境）
task dev

# オーバーレイのビルド
cd web && bun run build

# テストの実行（DRY_RUN_MODE=trueで実行）
task test
```

### 音声認識（mic-recog）
- `task build` で PyInstaller ビルド後、`.app` の `Resources/mic-recog` に同梱されます  
- 開発中は `mic-recog/.venv` を作るか、`MIC_RECOG_DIR` でパスを指定してください  
- macOS は `--device auto` で MPS（GPU）を自動選択します（未対応ならCPU）
- 初回起動時に Whisper のモデルをダウンロードします

### ローカル翻訳（Ollama）
ローカル翻訳は Ollama を使います。Settings画面のAIタブで翻訳バックエンドを `Ollama` に切り替え、モデルとサーバURLを設定してください。言語コードは `jpn_Jpan` 形式（例: `jpn_Jpan`, `eng_Latn`, `rus_Cyrl`）を使用します。

```bash
# 例: サーバ起動（localhostのときはアプリが自動起動を試みます）
ollama serve

# 例: モデル取得（UIの「モデルを取得」でもOK）
ollama pull translategemma:12b
```

### オーバーレイの開発フロー
1. `web/`ディレクトリで変更を行う
2. `cd web && bun run build`でビルド
3. `task dev`でWailsアプリとして動作確認
4. オーバーレイは`http://localhost:[動的ポート]/`でアクセス可能

## 設定管理

すべての設定はWailsアプリケーションのSettings画面から行います。環境変数ファイル（.env）は不要です。

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
2. `task dev`でWailsアプリを再起動
3. Settings画面でポート設定を確認

## タスク管理（Taskfile）

主要なタスクコマンド:
- `task dev` - 開発モード起動
- `task build:all` - プロダクションビルド
- `task test` - テスト実行
- `task lint` - リント実行

## ライセンス

MIT
