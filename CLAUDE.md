# 基本

- チャットは日本語で行う
  - 語尾は「だす」「ダス」
- コミットメッセージは日本語で書く
- ドキュメント作成時は日本語で書く

# 最重要

**Codex / Claude の共通運用は [`.ai/workflow.md`](.ai/workflow.md) を正とする。**

# 必読ドキュメント

- [`.ai/rules.md`](.ai/rules.md)
- [`.ai/project.md`](.ai/project.md)
- [`.ai/workflow.md`](.ai/workflow.md)
- [`.ai/review.md`](.ai/review.md)
- [`.ai/git.md`](.ai/git.md)
- [`.ai/dev-env.md`](.ai/dev-env.md)

# Claude Code 固有の補足

- `/pick` 相当の指示やIssue番号の明示がなく、`current_issue` も未確定の依頼は、planモードでOpen Issue候補を優先度順に提示し、採用Issueをユーザー確認する
- 対象Issue確定時は `.context/current_issue` にIssue番号を1行で書き出す
- セッション開始時に `.context/current_issue` があれば対象Issueとして復元する
- 対象PRがマージされ、Issue完了が確認できたら `.context/current_issue` を削除する

# プロジェクト構成

## ディレクトリ構成
- **`src-tauri/`** - Tauriアプリ本体（Rust）
  - Tauriの設定、コマンド定義、エントリーポイント

- **`crates/`** - Rustワークスペースクレート
  - `catprinter` - サーマルプリンター制御
  - `image-processor` - 画像処理
  - `overlay-db` - データベース管理
  - `twitch-client` - Twitch連携
  - `word-filter` - ワードフィルター

- **`web/`** - OBSオーバーレイ用フロントエンド
  - ビルドして`dist/`に出力される
  - Tauriに組み込んで配信
  - `.env`のポート設定（3456）は**単体デバッグ用のみ**
  - 通常はビルド後にTauriから配信される

- **`frontend/`** - Settings画面用フロントエンド（Dashboard）
  - Tauriアプリのメインフロントエンド（設定画面）

## 開発フロー

### オーバーレイの開発
1. **変更時のビルドと確認**
   ```bash
   cd web && bun run build  # オーバーレイをビルド
   task dev                 # Tauriで統合動作確認
   ```

2. **単体デバッグ（特殊な場合のみ）**
   ```bash
   cd web && bun run dev    # localhost:5174で単体起動
   # この場合は.envのVITE_BACKEND_PORT（3456）を使用
   ```

### Settings画面の開発
```bash
task dev  # Tauriアプリとして起動して確認
```

## 重要な注意事項
- **オーバーレイ（web/）は単体では正常動作しない**
  - 必ずビルドしてTauriに組み込んで動作確認する
  - `bun run dev`での単体起動はデバッグ目的のみ

- **APIポートの扱い**
  - web/: Tauri経由で配信されるため相対パス使用
  - 直接ポート番号を指定しない

# プロジェクトガイドライン

## プロジェクトの経緯と参照情報
- このプロジェクトは元々Go + Wails構成で、現在はTauri 2（Rust）に移行済み
- バックエンドはRust（`src-tauri/` + `crates/`）で実装されている
- Go/Wailsのレガシーコード（`internal/`、`main.go`等）はまだリポジトリに残存しているが、実行には使用されない
- 元プロジェクトのディレクトリ: `/Users/toka/Abyss/twitch-overlay/`

## テスト実行時の注意事項
- テストを実行する際は必ず `DRY_RUN_MODE=true` 環境変数を設定する
- これにより実際のプリンターへの印刷を防ぐ
- 例: `DRY_RUN_MODE=true cargo test`

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
- `src-tauri/target/` はgitignore済みだが、不要なビルド成果物は `task clean` で削除する
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

### コミットメッセージフォーマット

- 形式: `絵文字 scope: 説明`
- 説明は日本語で簡潔に書く
- 完全な絵文字リストは `docs/guides/CODING_STANDARDS.md` を参照する
