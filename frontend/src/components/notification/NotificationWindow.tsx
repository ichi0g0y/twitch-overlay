import { useEffect, useState } from 'react';
import { getCurrentWindow, type ResizeDirection } from '@tauri-apps/api/window';
import { ChatNotification } from '../../types/notification';
import { buildApiUrl } from '../../utils/api';
import { initWebSocket } from '../../utils/websocket';
import { MessageContent } from './MessageContent';

/**
 * NotificationWindow component
 * Displays Twitch chat notifications in a separate window
 */
export function NotificationWindow() {
  const [notification, setNotification] = useState<ChatNotification | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isMovable, setIsMovable] = useState(true);
  const [isResizable, setIsResizable] = useState(true);

  const parseBool = (value: unknown, defaultValue: boolean): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
    return defaultValue;
  };

  const applyInteractionSettings = (payload: any) => {
    const settings = payload?.settings;
    if (!settings || typeof settings !== 'object') return;

    const movableValue = settings.NOTIFICATION_WINDOW_MOVABLE?.value;
    const resizableValue = settings.NOTIFICATION_WINDOW_RESIZABLE?.value;
    const movable = parseBool(movableValue, true);
    const resizable = parseBool(resizableValue, true);

    setIsMovable(movable);
    setIsResizable(movable && resizable);
  };

  const fetchInteractionSettings = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/v2'));
      if (!response.ok) return;
      const payload = await response.json();
      applyInteractionSettings(payload);
    } catch (error) {
      console.warn('[NotificationWindow] Failed to fetch interaction settings:', error);
    }
  };

  const startWindowDragging = (event: React.MouseEvent<HTMLElement>) => {
    if (!isMovable || event.button !== 0) return;
    event.preventDefault();
    void getCurrentWindow().startDragging().catch((error) => {
      console.warn('[NotificationWindow] Failed to start window dragging:', error);
    });
  };

  const startWindowResizing = (event: React.MouseEvent<HTMLElement>, direction: ResizeDirection) => {
    if (!isResizable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    void getCurrentWindow().startResizeDragging(direction).catch((error) => {
      console.warn('[NotificationWindow] Failed to start window resize dragging:', error);
    });
  };

  // 新しい通知が来たときにフラッシュアニメーションを実行
  useEffect(() => {
    if (notification) {
      setIsFlashing(true);
      const timer = setTimeout(() => {
        setIsFlashing(false);
      }, 300); // 300ms後にフラッシュを終了

      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    console.log('[NotificationWindow] Component mounted');

    void fetchInteractionSettings();

    let unsubscribeNotification: (() => void) | null = null;
    let unsubscribeSettingsUpdated: (() => void) | null = null;

    // Initialize WebSocket connection and listen for notifications
    const setupWebSocket = async () => {
      try {
        console.log('[NotificationWindow] Initializing WebSocket connection');
        const ws = await initWebSocket();
        console.log('[NotificationWindow] WebSocket connected');

        // Listen for chat-notification messages from Go backend via WebSocket
        unsubscribeNotification = ws.on('chat-notification', (data: any) => {
          console.log('[NotificationWindow] Received chat-notification', data);

          if (data && typeof data === 'object' && 'username' in data && 'message' in data) {
            setNotification({
              username: String(data.username),
              message: String(data.message),
              fragments: data.fragments, // フラグメントデータを含める
              fontSize: data.fontSize || 14, // フォントサイズ（デフォルト14px）
              avatarUrl: data.avatarUrl, // アバターURL
            });
            console.log('[NotificationWindow] Notification state updated', {
              username: data.username,
              message: data.message,
              fragments: data.fragments,
              fontSize: data.fontSize,
              avatarUrl: data.avatarUrl,
            });
          } else {
            console.error('[NotificationWindow] Invalid notification data', data);
          }
        });

        unsubscribeSettingsUpdated = ws.on('settings_updated', () => {
          void fetchInteractionSettings();
        });

        console.log('[NotificationWindow] WebSocket listener registered for chat-notification');

        // Mark window as ready (for Go backend)
        window.isNotificationReady = true;
        console.log('[NotificationWindow] Window marked as ready');
      } catch (error) {
        console.error('[NotificationWindow] Failed to setup WebSocket:', error);
      }
    };

    setupWebSocket();

    // Cleanup
    return () => {
      console.log('[NotificationWindow] Cleaning up WebSocket listener');
      unsubscribeNotification?.();
      unsubscribeSettingsUpdated?.();
    };
  }, []);

  return (
    <div
      className={`w-full h-screen bg-transparent overflow-hidden transition-colors duration-300 ${
        isFlashing ? 'text-black' : 'text-white'
      }`}
      style={{
        fontFamily: '"Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
      }}
    >
      <div
        className={`relative w-full h-full rounded-2xl overflow-hidden flex flex-col border shadow-xl ${
          isFlashing
            ? 'bg-[rgba(220,220,220,0.95)] border-[rgba(255,255,255,0.55)]'
            : 'bg-[rgba(30,30,30,0.95)] border-[rgba(255,255,255,0.2)]'
        }`}
      >
        <div
          className={`absolute inset-x-0 top-0 z-10 h-8 ${isMovable ? 'cursor-move' : 'cursor-default'}`}
          onMouseDown={startWindowDragging}
        />

        {isResizable && (
          <button
            type="button"
            aria-label="Resize notification window"
            className={`absolute bottom-1 right-1 z-20 h-4 w-4 cursor-se-resize rounded-sm border ${
              isFlashing
                ? 'border-gray-700/40 bg-gray-500/30'
                : 'border-white/30 bg-white/20'
            }`}
            onMouseDown={(event) => startWindowResizing(event, 'SouthEast')}
          />
        )}

        <div className="relative pt-8 px-4 pb-4 flex-1">
          {notification ? (
            <div className="flex gap-3">
              {/* アバター */}
              {notification.avatarUrl && (
                <div className="flex-shrink-0">
                  <img
                    src={notification.avatarUrl}
                    alt={`${notification.username}'s avatar`}
                    className="rounded-full"
                    style={{
                      width: '64px',
                      height: '64px',
                      imageRendering: 'pixelated',
                      objectFit: 'cover'
                    }}
                  />
                </div>
              )}

              {/* ユーザー名とメッセージ */}
              <div className="flex-1 min-w-0">
                <div
                  id="username"
                  className="font-bold mb-2 text-[#9147ff]"
                  style={{ fontSize: `${(notification.fontSize || 14) + 1}px` }}
                >
                  {notification.username}
                </div>
                <div
                  id="message"
                  className={`leading-[1.5] break-words ${isFlashing ? 'text-gray-900' : 'text-white'}`}
                  style={{ fontSize: `${notification.fontSize || 14}px` }}
                >
                  <MessageContent
                    message={notification.message}
                    fragments={notification.fragments}
                    fontSize={notification.fontSize}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-[14px]">
              Waiting for notification...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    isNotificationReady?: boolean;
  }
}
