# フロントエンド開発ガイドライン

## TypeScript化の注意事項
- フロントエンドはTypeScriptで実装されている
- アニメーション処理は`requestAnimationFrame`を使用して実装されており、型安全性を保ちながら動作する
- 定数ファイル（`layout.ts`）には動的なgetterメソッドが含まれている
- すべての型定義は`src/types/index.ts`に集約されている

## 開発コマンド
- `bun run dev`: 開発サーバーの起動
- `bun run build`: プロダクションビルド
- `bun run tsc --noEmit`: TypeScriptの型チェック
- `bun run lint`: ESLintの実行

## 音楽プレイヤーのテスト手順
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
