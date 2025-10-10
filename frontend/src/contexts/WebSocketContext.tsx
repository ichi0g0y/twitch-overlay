import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Events } from '@wailsio/runtime';

interface WebSocketContextValue {
  isConnected: boolean;
  on: (event: string, handler: (data: any) => void) => () => void;
  send: (type: string, data: any) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
}

// Wailsデスクトップアプリ用のWebSocketコンテキスト
// 実際にはWailsのイベントシステムを使用
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(true);
  const [eventCleanups] = useState<Map<string, () => void>>(new Map());

  const on = useCallback((event: string, handler: (data: any) => void) => {
    // 既存のクリーンアップがあれば実行
    const existingCleanup = eventCleanups.get(event);
    if (existingCleanup) {
      existingCleanup();
    }

    // Wailsのイベントリスナーを登録
    const unsubscribe = Events.On(event, handler);

    // クリーンアップ関数を保存
    const cleanup = () => {
      unsubscribe();
      eventCleanups.delete(event);
    };
    eventCleanups.set(event, cleanup);

    // クリーンアップ関数を返す
    return cleanup;
  }, [eventCleanups]);

  const send = useCallback((type: string, data: any) => {
    // Wailsの場合、フロントエンドからバックエンドへはメソッド呼び出しを使用
    // ここではログを出力するのみ
    console.log('WebSocket send requested:', type, data);
  }, []);

  useEffect(() => {
    // プリンター接続状態の変更をリッスン
    const unsubPrinter = on('printer_connected', (connected: boolean) => {
      console.log('Printer connection status:', connected);
    });

    // ストリーム状態の変更をリッスン
    const unsubStream = on('stream_status_changed', (status: any) => {
      console.log('Stream status changed:', status);
    });

    // 設定更新をリッスン
    const unsubSettings = on('settings_updated', (settings: any) => {
      console.log('Settings updated:', settings);
    });

    return () => {
      unsubPrinter();
      unsubStream();
      unsubSettings();
    };
  }, [on]);

  const value: WebSocketContextValue = {
    isConnected,
    on,
    send,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}