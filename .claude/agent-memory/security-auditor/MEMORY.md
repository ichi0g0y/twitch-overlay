# Security Auditor Memory

## Codebase Patterns

### Authentication Architecture
- **Two-tier auth system**: `elder` (管理者用) と `console` (一般ユーザー用) の2系統の認証システムが存在
- **Session management**: Redisベースのセッションストレージ + signed cookie
  - Elder: `kpSessionElder` prefix
  - Console: `kpSession` prefix
  - Session期間: 14日間 (`SESSION_EXPIRE_SEC = SECONDS_IN_DAY * 14`)
- **Cookie implementation**: Remix互換のcookie実装を使用 (`@mijinco/node-utils/remix-cookie`)
  - HMAC-SHA256 署名
  - base64エンコード
  - タイミング攻撃対策: `timingSafeEqual` 使用

### OAuth Implementations
- **Twitch OAuth**: `elder` と `console` 両方で実装
  - CSRF保護: `nanoid()` によるstate生成とセッション内検証
  - トークン保存: セッション内にアクセストークンとリフレッシュトークンを保存
- **X (Twitter) OAuth 1.0a**: `console` のみ
  - CSRF保護: oauth_token_secret をRedisに一時保存 (TTL: 10分)
  - トークン暗号化: Cryptr による暗号化 (`CONSOLE_CRYPT_SECRET`)
- **Discord OAuth**: `console` のみ
  - トークン保存: Redisに平文で保存

### Authorization Patterns
- **Elder**: 特定のTwitchユーザーID (`ELDER_TWITCH_ID`) のみアクセス許可
- **Console**: フォロワーチェック + サブスクリプションチェック

## Common Vulnerabilities Found

### High Priority Issues
1. **Access Token漏洩リスク**: セッション内にTwitchアクセストークンを平文保存
2. **Redis JSON fallback**: エラー時にJSON.stringify/parseで処理するが、型安全性が損なわれる可能性
3. **Discord OAuth state未検証**: CSRF保護がない

### Medium Priority Issues
1. **レート制限なし**: OAuth callbackエンドポイントにレート制限がない
2. **X OAuth token_secret TTL短い**: 10分のTTLは短すぎる可能性（ユーザーが認証を完了できない）
3. **エラーメッセージの情報漏洩**: 一部のエラーで詳細な情報を含む可能性

### Low Priority Issues
1. **セッションIDの予測可能性**: nanoid使用で十分な強度はあるが、長さが明示されていない

## Security Best Practices in This Project
- ✅ Cookie属性が適切に設定されている (`httpOnly`, `secure`, `sameSite: 'lax'`)
- ✅ Redirect先の検証 (`resolveSafeRedirectPath`)
- ✅ Zodによる入力検証
- ✅ タイミング攻撃対策 (`timingSafeEqual`)

## Testing Considerations
- OAuth flowの各ステップでstate検証が機能するか
- セッションの有効期限とRedis TTLの同期
- トークンリフレッシュのタイミング
- 不正なcallbackパラメータの処理
