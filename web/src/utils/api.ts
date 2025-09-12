// APIのベースURLを取得
export function getApiBaseUrl(): string {
  // 環境変数が設定されている場合はそれを使用
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // 本番環境では現在のホストとポートを使用（相対パス）
  if (import.meta.env.PROD) {
    // 本番環境: 現在のページと同じホスト・ポートを使用
    return '';
  }
  
  // 開発環境
  return '';
}

// API URLを構築（通常のfetch用）
export function buildApiUrl(path: string): string {
  // 環境変数が設定されている場合
  if (import.meta.env.VITE_API_BASE_URL) {
    return `${import.meta.env.VITE_API_BASE_URL}${path}`;
  }
  
  // 本番環境
  if (import.meta.env.PROD) {
    return path;
  }
  
  // 開発環境: Viteプロキシが機能しない場合があるので、完全なURLを返す
  const backendPort = import.meta.env.VITE_BACKEND_PORT || '8080';
  return `http://localhost:${backendPort}${path}`;
}