# 基本

- チャットは日本語で行う
  - 語尾は「だす」「ダス」

# AI運用の正本

- 共通挙動は `.ai/behavior.md` を正とする
- 常時必読: `.ai/rules.md` / `.ai/project.md` / `.ai/workflow.md` / `.ai/behavior.md`
- `/review-verify` 時の追加必読: `.ai/review.md` / `.ai/dev-env.md` / `.ai/git.md`
- 手順書・計画・レビュー観点は `issues/` に集約する
- 作業はIssue単位でworktreeを分け、1Issue 1PRを基本に小さく進める

# プロジェクト構成

## ディレクトリ構成
- **`web/`** - オーバーレイ用フロントエンド
  - ビルドして`dist/`に出力される
  - Wailsの埋め込みアセットとして配信
  - `.env`のポート設定（3456）は**単体デバッグ用のみ**
  - 通常はビルド後にWailsから配信される
  
- **`frontend/`** - Wails Settings画面用フロントエンド  
  - Wailsアプリのメインフロントエンド（設定画面）
  - `GetServerPort()`でGoから動的にバックエンドポートを取得
  - APIアクセス時は必ず動的ポート取得を使用

- **`internal/`** - Goバックエンド
  - Webサーバー、API、プリンター制御など
  - ポートは設定から動的に決定（デフォルト: 8080）

## 開発フロー

### オーバーレイの開発
1. **変更時のビルドと確認**
   ```bash
   cd web && bun run build  # オーバーレイをビルド
   task dev                 # Wailsで統合動作確認
   ```
   
2. **単体デバッグ（特殊な場合のみ）**
   ```bash
   cd web && bun run dev    # localhost:5174で単体起動
   # この場合は.envのVITE_BACKEND_PORT（3456）を使用
   ```

### Settings画面の開発
```bash
task dev  # Wailsアプリとして起動して確認
```

## 重要な注意事項
- **オーバーレイ（web/）は単体では正常動作しない**
  - 必ずビルドしてWailsに組み込んで動作確認する
  - `bun run dev`での単体起動はデバッグ目的のみ
  
- **APIポートの扱い**
  - frontend/: `GetServerPort()`で動的取得（必須）
  - web/: Wails経由で配信されるため相対パス使用
  - 直接8080を指定しない

# プロジェクトガイドライン

## プロジェクトの経緯と参照情報
- このプロジェクトは `../twitch-overlay` をベースにWails化されたものです
- 元プロジェクト（`../twitch-overlay`）はGoとフロントエンドが分離された構成でした
- Wails化により、GoとフロントエンドがWailsフレームワークで統合されています
- **重要**: 動作確認や機能実装の際は、元プロジェクトのコードも参考にすること
  - 特にプリンター関連の処理やTwitch連携の動作は元プロジェクトの実装を参照
  - 元プロジェクトのディレクトリ: `/Users/toka/Abyss/twitch-overlay/`

## コミュニケーション
- すべてのチャットは日本語で行う
- ドキュメントも日本語で記載する

## テスト実行時の注意事項
- テストを実行する際は必ず `DRY_RUN_MODE=true` 環境変数を設定する
- これにより実際のプリンターへの印刷を防ぐ
- 例: `DRY_RUN_MODE=true go test ./...`

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

## ビルド時の注意事項
- ビルドテストが完了したら、生成されたバイナリファイルは削除する
- 例: `go build ./cmd/twitch-overlay && rm twitch-overlay`
- リポジトリにバイナリファイルをコミットしない

## heimdallサーバーへのデプロイ
- heimdallへのコピーを指示された場合は、**差分コピーのみ**を行う
- rsyncを使用して差分転送を実行:
```bash
rsync -avz --exclude='.git' --exclude='dist' --exclude='node_modules' --exclude='*.log' /Users/toka/Abyss/twitch-overlay/ heimdall:~/twitch-overlay/
```
- 全体コピーは避け、変更されたファイルのみを転送すること

## フロントエンド開発ガイドライン

### TypeScript化の注意事項
- フロントエンドはTypeScriptで実装されている
- アニメーション処理は`requestAnimationFrame`を使用して実装されており、型安全性を保ちながら動作する
- 定数ファイル（`layout.ts`）には動的なgetterメソッドが含まれている
- すべての型定義は`src/types/index.ts`に集約されている

### 開発コマンド
- `bun run dev`: 開発サーバーの起動
- `bun run build`: プロダクションビルド
- `bun run tsc --noEmit`: TypeScriptの型チェック
- `bun run lint`: ESLintの実行

### 音楽プレイヤーのテスト手順
1. **開発サーバーの起動**:
   ```bash
   cd web && bun run dev
   ```
   - http://localhost:5174/ でアクセス可能

2. **停止→再生テスト**:
   - 音楽を再生して停止ボタンを押す
   - プレイヤーが画面下にアニメーションで消える
   - 再生ボタンを押す
   - プレイヤーが画面下からアニメーションで登場
   - MediaElementSourceNodeエラーが発生しないことを確認
   - Visualizerが正常に表示されることを確認

3. **期待される動作**:
   - 一時停止→再生：問題なし（従来通り）
   - 停止→再生：MediaElementSourceNodeエラー無し、Visualizer表示正常

## Goテストガイドライン

### テストフレームワーク
- Go標準ライブラリの `testing` パッケージを使用する
- 外部のテストフレームワークは明示的に要求されない限り使用しない

### ファイル構成
- テストファイルは必ず `_test.go` で終わる
- テストファイルはテスト対象のコードと同じパッケージ/ディレクトリに配置する
- 命名規則: `filename.go` → `filename_test.go`

### テスト関数の命名
- テスト関数名は `Test` で始まり、その後に関数名/メソッド名を続ける
- わかりやすい名前を使用: `TestFunctionName` または `TestTypeName_MethodName`
- サブテストには `t.Run()` を使用し、わかりやすい名前を付ける

### テストの構成
```go
// 基本的なテスト構造
func TestFunctionName(t *testing.T) {
    // 準備 (Arrange)
    // 実行 (Act)
    // 検証 (Assert)
}

// テーブル駆動テスト
func TestFunctionName(t *testing.T) {
    tests := []struct {
        name     string
        input    type
        expected type
    }{
        // テストケース
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // テストロジック
        })
    }
}
```

### ベストプラクティス
- 複数のテストケースにはテーブル駆動テストを使用
- テストは独立して実行できるようにする
- テストヘルパー関数には `t.Helper()` を使用
- テストフィクスチャは `testdata/` ディレクトリに配置
- 外部依存関係は必要に応じてモックする
- 並行実行可能なテストには `t.Parallel()` を使用
- AAA パターン（準備・実行・検証）に従う

### ソースファイルサイズ制限

**コードの可読性と保守性を確保するための制限:**
- **1ファイル最大300行程度まで** - これを超える場合は必ず分割
- **1関数最大100行程度まで** - これを超える場合は必ずリファクタリング
- **制限を超える場合の対処法:**
  - 別モジュールへの分割
  - 共通モジュール化
  - 責務の分離とリファクタリング
  - 関連する機能をサブモジュールとして整理

## Git コミットガイドライン

### 重要：コミットルール
- **勝手にコミットしない** - ユーザーから明示的にコミットの指示があった場合のみコミットを実行する
- コード変更後は、変更内容の説明のみ行い、コミットは行わない

### コミットメッセージ絵文字ガイド

- 🐛 :bug: バグ修正
- 🎈 :balloon: 文字列変更や軽微な修正
- 👍 :+1: 機能改善
- ✨ :sparkles: 部分的な機能追加
- 🎉 :tada: 盛大に祝うべき大きな機能追加
- ♻️ :recycle: リファクタリング
- 🚿 :shower: 不要な機能・使われなくなった機能の削除
- 💚 :green_heart: テストやCIの修正・改善
- 👕 :shirt: Lintエラーの修正やコードスタイルの修正
- 🚀 :rocket: パフォーマンス改善
- 🆙 :up: 依存パッケージなどのアップデート
- 🔒 :lock: 新機能の公開範囲の制限
- 👮 :cop: セキュリティ関連の改善
- 🔧 :wrench: 設定関連変更
- 📝 :memo: ドキュメントの整理
- 🚧 :construction: 作業中

### コミットメッセージフォーマット

```
:emoji: Subject

Commit body...
```
