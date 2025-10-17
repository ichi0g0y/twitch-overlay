import { useEffect, useState } from 'react';
import { ChatNotification } from '../../types/notification';
import { initWebSocket } from '../../utils/websocket';

/**
 * NotificationWindow component
 * Displays Twitch chat notifications in a separate window
 */
export function NotificationWindow() {
  const [notification, setNotification] = useState<ChatNotification | null>(null);

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
            });
            console.log('[NotificationWindow] Notification state updated', {
              username: data.username,
              message: data.message,
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
    <div className="w-full h-full bg-[rgba(30,30,30,0.95)] overflow-hidden">
      <div className="w-full h-full rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex flex-col">
        <div className="pt-8 px-4 pb-4 flex-1">
          {notification ? (
            <>
              <div
                id="username"
                className="font-bold text-[15px] mb-2 text-[#9147ff]"
              >
                {notification.username}
              </div>
              <div
                id="message"
                className="text-[14px] leading-[1.5] break-words text-white"
              >
                {notification.message}
              </div>
            </>
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
