import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';

interface WailsEventContextValue {
  isConnected: boolean;
  on: (event: string, handler: (data: any) => void) => () => void;
  emit: (event: string, data: any) => void;
}

const WailsEventContext = createContext<WailsEventContextValue | null>(null);

interface WailsEventProviderProps {
  children: ReactNode;
}

export function WailsEventProvider({ children }: WailsEventProviderProps) {
  const [isConnected, setIsConnected] = useState(true);
  const [handlers] = useState<Map<string, Set<(data: any) => void>>>(new Map());

  const on = useCallback((event: string, handler: (data: any) => void) => {
    if (!handlers.has(event)) {
      handlers.set(event, new Set());
    }
    handlers.get(event)!.add(handler);

    // Wailsのイベントリスナーを登録
    EventsOn(event, handler);

    // クリーンアップ関数を返す
    return () => {
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        eventHandlers.delete(handler);
        if (eventHandlers.size === 0) {
          handlers.delete(event);
        }
      }
      EventsOff(event);
    };
  }, [handlers]);

  const emit = useCallback((event: string, data: any) => {
    // Wailsの場合、フロントエンドからバックエンドへはメソッド呼び出しを使用
    // ここではログを出力するのみ
    console.log('Event emit requested:', event, data);
  }, []);

  useEffect(() => {
    // 接続状態の変更をリッスン
    const unsubscribe = EventsOn('connection_status', (status: boolean) => {
      setIsConnected(status);
    });

    return () => {
      EventsOff('connection_status');
    };
  }, []);

  const value: WailsEventContextValue = {
    isConnected,
    on,
    emit,
  };

  return (
    <WailsEventContext.Provider value={value}>
      {children}
    </WailsEventContext.Provider>
  );
}

export function useWailsEvent() {
  const context = useContext(WailsEventContext);
  if (!context) {
    throw new Error('useWailsEvent must be used within a WailsEventProvider');
  }
  return context;
}