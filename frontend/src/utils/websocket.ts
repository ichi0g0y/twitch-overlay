import { buildApiUrl } from './api';
import { GetServerPort } from '../../bindings/github.com/nantokaworks/twitch-overlay/app.js';

type MessageHandler = (data: any) => void;
type ConnectionHandler = () => void;

interface WSMessage {
  type: string;
  data: any;
}

/**
 * 統合WebSocketクライアント
 * すべてのリアルタイム通信を1つの接続で管理
 */
class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private disconnectionHandlers: Set<ConnectionHandler> = new Set();
  private isIntentionallyClosed = false;
  private clientId: string;

  constructor() {
    // クライアントIDを生成（タブごとに一意）
    this.clientId = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
    
    // URLは接続時に動的に生成
    this.url = '';
  }

  /**
   * WebSocket接続を開始
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.isIntentionallyClosed = false;
    await this.attemptConnection();
  }

  /**
   * 接続を試行
   */
  private async attemptConnection(): Promise<void> {
    console.log(`Attempting WebSocket connection (attempt ${this.reconnectAttempts + 1}, clientId: ${this.clientId})`);
    
    try {
      // 動的にポートを取得してURLを構築
      const port = await GetServerPort();
      this.url = `ws://localhost:${port}/ws?clientId=${this.clientId}`;
      
      this.ws = new WebSocket(this.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * WebSocketイベントハンドラーを設定
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log(`WebSocket connected (clientId: ${this.clientId})`);
      this.reconnectAttempts = 0;
      
      // 接続ハンドラーを呼び出し
      this.connectionHandlers.forEach(handler => handler());
      
      // ハートビートを開始
      this.startHeartbeat();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        console.log('WebSocket message received:', message.type);
        
        // メッセージタイプ別にハンドラーを呼び出し
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(message.data);
            } catch (error) {
              console.error(`Error in message handler for type ${message.type}:`, error);
            }
          });
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error, event.data);
      }
    };

    this.ws.onerror = (error: Event) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log(`WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);
      
      // ハートビートを停止
      this.stopHeartbeat();
      
      // 切断ハンドラーを呼び出し
      this.disconnectionHandlers.forEach(handler => handler());
      
      // 意図的な切断でなければ再接続
      if (!this.isIntentionallyClosed) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * 再接続をスケジュール
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    // 既存のタイムアウトをクリア
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // 指数バックオフ（3秒、6秒、12秒...最大30秒）
    const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.log(`Will retry WebSocket connection in ${delay/1000} seconds (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(async () => {
      await this.attemptConnection();
    }, delay);
  }

  /**
   * ハートビートを開始
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    // 30秒ごとにpingを送信
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  /**
   * ハートビートを停止
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * メッセージハンドラーを登録
   */
  on(type: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    
    this.messageHandlers.get(type)!.add(handler);
    
    // クリーンアップ関数を返す
    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(type);
        }
      }
    };
  }

  /**
   * 接続イベントハンドラーを登録
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    
    // 既に接続されている場合は即座に呼び出し
    if (this.ws?.readyState === WebSocket.OPEN) {
      handler();
    }
    
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  /**
   * 切断イベントハンドラーを登録
   */
  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectionHandlers.add(handler);
    
    return () => {
      this.disconnectionHandlers.delete(handler);
    };
  }

  /**
   * メッセージを送信
   */
  send(type: string, data: any): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send message');
      return;
    }

    const message: WSMessage = { type, data };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * 接続を切断
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    
    // 再接続タイムアウトをクリア
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // ハートビートを停止
    this.stopHeartbeat();
    
    // WebSocket接続を閉じる
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 接続状態を取得
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * クライアントIDを取得
   */
  get id(): string {
    return this.clientId;
  }
}

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