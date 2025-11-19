import { useEffect, useState } from 'react';
import { ChatNotification } from '../../types/notification';
import { initWebSocket } from '../../utils/websocket';
import { MessageContent } from './MessageContent';

/**
 * NotificationWindow component
 * Displays Twitch chat notifications in a separate window
 */
export function NotificationWindow() {
  const [notification, setNotification] = useState<ChatNotification | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);

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

    let unsubscribe: (() => void) | null = null;

    // Initialize WebSocket connection and listen for notifications
    const setupWebSocket = async () => {
      try {
        console.log('[NotificationWindow] Initializing WebSocket connection');
        const ws = await initWebSocket();
        console.log('[NotificationWindow] WebSocket connected');

        // Listen for chat-notification messages from Go backend via WebSocket
        unsubscribe = ws.on('chat-notification', (data: any) => {
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
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return (
    <div
      className={`w-full min-h-screen overflow-hidden transition-colors duration-300 ${
        isFlashing ? 'bg-[rgba(220,220,220,0.95)]' : 'bg-[rgba(30,30,30,0.95)]'
      }`}
      style={{
        fontFamily: '"Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
      }}
    >
      <div className="w-full h-full rounded-xl flex flex-col">
        <div className="pt-8 px-4 pb-4 flex-1">
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
                  className="leading-[1.5] break-words text-white"
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
