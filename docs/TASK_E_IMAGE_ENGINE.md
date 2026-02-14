# TASK E: 画像生成エンジン拡張

> 運用メモ: 進行中タスクの正本は `issues/` へ移行しました。
> 移行先Issue: `issues/open/ISSUE-0007-issue-task-e-image-engine/README.md`


- 優先度: **P2**
- 見積: 3-4日
- 依存: なし（Phase Aと並列可）
- ブロック: Phase F（印刷オーケストレーション）

---

## 目的

`image-processor` クレートを `image-engine` にリネーム・拡張し、Go版 `image.go` (1,824行) の全画像生成機能を移植する。現在は dither/resize/rotate のみ。

---

## タスク

### E-1. クレートリネーム + 依存追加

**変更対象**: `crates/image-processor/Cargo.toml`

```toml
[package]
name = "image-engine"  # リネーム

[dependencies]
image = "0.25"
rusttype = "0.9"       # テキストレンダリング
qrcode = "0.14"        # QRコード生成
reqwest = { version = "0.12", features = ["rustls-tls"] }  # Emoteダウンロード
sha1 = "0.10"          # キャッシュハッシュ
```

ワークスペースの依存参照も更新。

### E-2. テキストレンダリング (`text.rs`)

**新規作成**: `crates/image-engine/src/text.rs`

- `draw_centered_text(img, text, font, size, y)` — 中央揃えテキスト描画
- `wrap_text(text, font, size, max_width) -> Vec<String>` — テキスト折り返し
- `wrap_fragments(fragments, font, size, max_width) -> Vec<Vec<Fragment>>` — テキスト/Emote/URL混合フラグメント折り返し
- カスタムフォント対応 (TTF/OTFファイル読み込み)
- フォールバックフォント（システムフォント）

**参考**: `internal/output/image.go:1-150` テキスト描画関数群

### E-3. メッセージ画像 (`message.rs`)

**新規作成**: `crates/image-engine/src/message.rs`

- `message_to_image(msg, emotes, font, options) -> DynamicImage`
- チャットメッセージ → 384px幅画像
- フラグメント対応: テキスト / Emote画像 / URL
- 改行処理、Emote埋め込み
- 背景白、テキスト黒

**参考**: `internal/output/image.go:200-450` MessageToImage

### E-4. タイトル付き画像 (`titled.rs`)

**新規作成**: `crates/image-engine/src/titled.rs`

- `message_to_image_with_title(title, detail, avatar, font, options) -> DynamicImage`
- ヘッダー: アバター (48px) + タイトルテキスト
- ボディ: 詳細テキスト（折り返し）
- フッター: 日時

**参考**: `internal/output/image.go:450-650` MessageToImageWithTitle

### E-5. 時刻画像 (`clock.rs`)

**新規作成**: `crates/image-engine/src/clock.rs`

- `generate_time_image_simple(time, font) -> DynamicImage` — シンプル時刻
- `generate_time_image_with_stats(time, leaders, font) -> DynamicImage` — +月次Cheerランキング（モノクロ）
- `generate_time_image_with_stats_color(time, leaders, font) -> DynamicImage` — カラー版（アバター128px）
- Twitch API呼び出し (`getBitsLeaders`) は呼び出し元から渡す設計にする

**参考**: `internal/output/image.go:650-900`

### E-6. QRコード生成 (`qr.rs`)

**新規作成**: `crates/image-engine/src/qr.rs`

- `generate_qr(text, size) -> DynamicImage`
- `qrcode` crateでQRコード生成 → image crate の画像に変換
- 384px幅にリサイズ

**参考**: `internal/output/image.go:900-950`

### E-7. Emoteグリッド (`emote_grid.rs`)

**新規作成**: `crates/image-engine/src/emote_grid.rs`

- 複数Emoteを最大8セルの正方形グリッドで表示
- 1文字テキストはフォントスケール計算で全幅活用
- セルサイズ: 384px / ceil(sqrt(count))

**参考**: `internal/output/image.go:950-1100`

### E-8. 画像合成 (`compose.rs`)

**新規作成**: `crates/image-engine/src/compose.rs`

- `compose_images(layers: Vec<(DynamicImage, x, y)>) -> DynamicImage`
- 複数画像のレイヤリング（オーバーレイ）
- テキストオーバーレイ
- QRコード合成

**参考**: `internal/output/image.go:1100-1300`

### E-9. ダウンロード+キャッシュ (`download.rs`)

**新規作成**: `crates/image-engine/src/download.rs`

- `download_emote(url, cache_db) -> Result<DynamicImage>`
  - SHA1ハッシュでDB管理
  - MIME判定 (PNG/GIF/WebP)
  - 403エラー → QRコードフォールバック
- `download_avatar_gray(url, size) -> Result<DynamicImage>` — グレースケール
- `download_avatar_color(url, size) -> Result<DynamicImage>` — カラー
- `save_image_to_cache(hash, data, cache_db)` — キャッシュDB永続化

**参考**: `internal/output/image.go:1300-1600`

### E-10. フォントプレビュー (`preview.rs`)

**新規作成**: `crates/image-engine/src/preview.rs`

- `generate_preview_image(font_path, sample_text) -> DynamicImage`
- 指定フォントでサンプルテキストを描画
- 384px幅、白背景

**参考**: `internal/output/image.go:1600-1700`

---

## 完了条件

- [ ] テキストレンダリングがカスタムフォントで動作
- [ ] MessageToImage がGo版と同等の画像を出力
- [ ] MessageToImageWithTitle がアバター付きで動作
- [ ] 時刻画像3種が生成される
- [ ] QRコードが生成・合成される
- [ ] Emoteグリッドが正しいレイアウトで表示
- [ ] Emoteダウンロードがキャッシュ経由で動作
- [ ] ユニットテスト: 各関数の出力画像サイズ・内容検証

---

## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `internal/output/image.go` | 1,824 | 全画像生成機能 |
