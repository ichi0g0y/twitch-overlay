# test-runner MEMORY

## ビルドの注意事項

- `go build ./...` はフロントエンドビルド成果物 (`frontend/dist`, `web/dist`) が存在しないと失敗する
  - Wails埋め込みディレクティブ (`//go:embed all:frontend/dist`) が原因
  - バックエンドのみ検証する場合は `go build ./internal/...` または `go build ./cmd/...` を使用する
  - テスト実行は `go test ./internal/...` で代替可能（テストバイナリはWailsの埋め込みを参照しない）

## テスト実行の注意事項

- 必ず `DRY_RUN_MODE=true` を設定する（プリンターへの実印刷防止）
- キャッシュを無効化する場合は `-count=1` フラグを使用する
- テストが存在するパッケージ (2026-02時点):
  - `internal/localdb`
  - `internal/lottery`
  - `internal/twitchapi`
  - `internal/twitchtoken`
  - `internal/webserver`

## 既知の警告

- `internal/webserver` テスト時に多数の `ld: warning: macOS version mismatch` が出力される
  - ビルド環境 (macOS 26.0) とリンク対象 (11.0) のバージョン差異
  - テスト自体は正常に PASS するため無視してよい

## ファイルサイズ制限

- 1ファイル最大300行（2026-02時点 `channel_reward_handlers.go` は266行、制限内）
