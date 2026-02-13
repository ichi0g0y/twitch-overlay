# プロジェクトガイドライン

## プロジェクトの経緯と参照情報
- このプロジェクトは `../twitch-overlay` をベースにWails化されたものです
- 元プロジェクト（`../twitch-overlay`）はGoとフロントエンドが分離された構成でした
- Wails化により、GoとフロントエンドがWailsフレームワークで統合されています
- **重要**: 動作確認や機能実装の際は、元プロジェクトのコードも参考にすること
  - 特にプリンター関連の処理やTwitch連携の動作は元プロジェクトの実装を参照
  - 元プロジェクトのディレクトリ: `/Users/toka/Abyss/twitch-overlay/`

## 環境変数
### プリンター関連
- `ROTATE_PRINT`: プリンターに印刷する際に画像を180度回転させる（デフォルト: false）
  - プリンターの設置向きに合わせて使用する

### デバッグ関連
- フロントエンドで`?debug=true`パラメータを使用してデバッグパネルを表示可能
  - デバッグパネルではローカルモードで動作し、実際の印刷は行われない
  - `DEBUG_MODE=true`環境変数はバックエンドAPIモード用（通常は不要）

## プリンター接続管理

### KeepAlive機能の仕様
- go-catprinterモジュールには組み込みのKeepAlive機能が存在しない
- 長時間接続を維持するため、定期的にDisconnect→Reconnectを実行する必要がある
- この処理により、Bluetooth接続の安定性を保つ

### KeepAlive実装の階層的アプローチ
#### レベル1: 通常のKeepAlive処理（基本）
- **既存のcatprinterインスタンスを再利用**してDisconnect→Reconnectを実行
- BLEデバイスは保持したまま、接続のみをリフレッシュ
- 最も効率的で、通常はこの方法で十分
- 実装手順:
  1. 既存接続をDisconnect
  2. 500ms程度の待機
  3. 同じインスタンスで再度Connectを実行

#### レベル2: エラー時の強制リセット（最終手段）
- **catprinterインスタンス自体を再生成**してから接続
- BLEデバイスレベルでの完全なリセット
- 以下のエラーが発生した場合のみ使用:
  - `already exists`: BLEデバイスの状態不整合
  - `connection canceled`: 接続がキャンセルされた
  - `can't dial`: 接続確立に失敗
  - `broken pipe`: パイプ破損
  - その他のBluetooth関連エラー
- 実装手順:
  1. 既存インスタンスをStop()で完全に破棄
  2. 新しいcatprinterインスタンスを作成
  3. 新しいインスタンスでConnectを実行

### 実装上の重要ポイント
- **基本方針**: インスタンスの再利用を優先し、必要な場合のみ再生成
- **パフォーマンス**: インスタンス再生成はBLEデバイスの再取得を伴うため、処理時間が長い
- **安定性**: エラー時の再生成により、接続の信頼性を確保

### KeepAlive関連の環境変数
- `KEEP_ALIVE_ENABLED`: KeepAlive機能の有効/無効（デフォルト: false）
- `KEEP_ALIVE_INTERVAL`: KeepAliveの実行間隔（秒）（デフォルト: 60）

## Bluetooth権限設定（Linux環境）

### 権限が必要な理由
- go-catprinterはBluetoothデバイスにアクセスするためHCIソケットを使用
- 通常のユーザー権限ではHCIソケットにアクセスできない
- `cap_net_raw`と`cap_net_admin`のケーパビリティが必要

### 権限設定方法

#### 1. 自動設定（推奨）
```bash
# task build:all実行時に自動的に権限設定される
task build:all
```

#### 2. 手動設定
```bash
# ビルド済みバイナリに権限を付与
sudo setcap 'cap_net_raw,cap_net_admin+eip' dist/twitch-overlay

# 権限確認
getcap dist/twitch-overlay
```

#### 3. systemdサービスとして実行
```bash
# サービスインストール時に適切な権限設定が行われる
task service:install
```

### トラブルシューティング
- `can't init hci: no devices available`エラーが出る場合は権限設定を確認
- `bluetoothctl power on`でBluetoothアダプタの電源を確認
- `sudo usermod -a -G bluetooth $USER`でbluetoothグループに追加

## heimdallサーバーへのデプロイ
- heimdallへのコピーを指示された場合は、**差分コピーのみ**を行う
- rsyncを使用して差分転送を実行:
```bash
rsync -avz --exclude='.git' --exclude='dist' --exclude='node_modules' --exclude='*.log' /Users/toka/Abyss/twitch-overlay/ heimdall:~/twitch-overlay/
```
- 全体コピーは避け、変更されたファイルのみを転送すること
