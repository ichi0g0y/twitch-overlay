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
  
  // 開発環境: Viteプロキシは通常のfetch用。EventSourceには完全なURLが必要
  return '';
}

// API URLを構築（通常のfetch用）
export function buildApiUrl(path: string): string {
  // 環境変数が設定されている場合
  if (import.meta.env.VITE_API_BASE_URL) {
    return `${import.meta.env.VITE_API_BASE_URL}${path}`;
  }
  
  // Wails環境では常にHTTPサーバー経由でAPIにアクセス
  // 本番・開発環境共にlocalhostの完全なURLを使用
  const backendPort = import.meta.env.VITE_BACKEND_PORT || '8080';
  return `http://localhost:${backendPort}${path}`;
}

// 動的ポート取得版のAPI URL構築（非同期）
export async function buildApiUrlAsync(path: string): Promise<string> {
  // 環境変数が設定されている場合
  if (import.meta.env.VITE_API_BASE_URL) {
    return `${import.meta.env.VITE_API_BASE_URL}${path}`;
  }
  
  // Wails環境では動的にポートを取得
  try {
    // GetServerPortをインポートして使用（循環参照を避けるため動的インポート）
    const { GetServerPort } = await import('../../bindings/github.com/nantokaworks/twitch-overlay/app.js');
    const port = await GetServerPort();
    return `http://localhost:${port}${path}`;
  } catch (error) {
    // フォールバック: 環境変数またはデフォルト値を使用
    const backendPort = import.meta.env.VITE_BACKEND_PORT || '8080';
    return `http://localhost:${backendPort}${path}`;
  }
}

