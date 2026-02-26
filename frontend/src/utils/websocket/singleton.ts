import { WebSocketClient } from './WebSocketClient';

// シングルトンインスタンス
let instance: WebSocketClient | null = null;

/**
 * WebSocketクライアントのシングルトンインスタンスを取得
 */
export function getWebSocketClient(): WebSocketClient {
  if (!instance) {
    instance = new WebSocketClient();
  }
  return instance;
}

/**
 * WebSocketクライアントを初期化して接続
 */
export async function initWebSocket(): Promise<WebSocketClient> {
  const client = getWebSocketClient();
  await client.connect();
  return client;
}
