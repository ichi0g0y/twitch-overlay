import { useEffect, useState, useRef } from 'react';
import { getWebSocketClient } from '../utils/websocket';

interface WebSocketMessage {
  type: string;
  data: any;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  send: (type: string, data: any) => void;
}

/**
 * WebSocket接続を管理するカスタムフック
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { onMessage, autoConnect = true } = options;
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);

  // 最新のonMessageを常にrefに保存
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const client = getWebSocketClient();

    // 自動接続が有効な場合は接続
    if (autoConnect) {
      client.connect();
    }

    // 接続状態を監視
    const updateConnectionStatus = () => {
      setIsConnected(client.isConnected);
    };

    // 接続・切断ハンドラーを登録
    const unsubscribeConnect = client.onConnect(() => {
      setIsConnected(true);
    });

    const unsubscribeDisconnect = client.onDisconnect(() => {
      setIsConnected(false);
    });

    // 初期状態を設定
    updateConnectionStatus();

    // メッセージハンドラーを登録
    const messageUnsubscribers: Array<() => void> = [];

    // すべてのメッセージタイプを購読
    const allMessageTypes = [
      'fax',
      'stream_status_changed',
      'printer_connected',
      'printer_disconnected',
      'music_status',
      'lottery_participant_added',
      'lottery_participants_updated',
      'lottery_started',
      'lottery_stopped',
      'lottery_winner',
      'lottery_participants_cleared',
      'mic_transcript',
      // 必要に応じて他のメッセージタイプを追加
    ];

    allMessageTypes.forEach((type) => {
      const unsubscribe = client.on(type, (data) => {
        // refから最新のonMessageを取得して呼び出す
        if (onMessageRef.current) {
          onMessageRef.current({ type, data });
        }
      });
      messageUnsubscribers.push(unsubscribe);
    });

    // クリーンアップ
    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      messageUnsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []); // 依存配列を空にして、マウント時のみ実行

  // メッセージ送信関数
  const send = (type: string, data: any) => {
    const client = getWebSocketClient();
    client.send(type, data);
  };

  return {
    isConnected,
    send,
  };
}
