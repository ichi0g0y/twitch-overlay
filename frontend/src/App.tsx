import { useEffect, useRef } from 'react';
import { SettingsPage } from './components/SettingsPage';
import { Toaster } from 'sonner';
import { SettingsProvider } from './contexts/SettingsContext';
import { WindowGetPosition, WindowGetSize, EventsOn } from '../wailsjs/runtime/runtime';
import { SaveWindowPosition } from '../wailsjs/go/main/App';

function App() {
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    // ウィンドウ位置を保存する関数
    const saveWindowPosition = async () => {
      try {
        const position = await WindowGetPosition();
        const size = await WindowGetSize();

        // 位置やサイズが変更された場合のみ保存
        const current = { x: position.x, y: position.y, w: size.w, h: size.h };
        if (lastPositionRef.current &&
            lastPositionRef.current.x === current.x &&
            lastPositionRef.current.y === current.y &&
            lastPositionRef.current.w === current.w &&
            lastPositionRef.current.h === current.h) {
          return;
        }

        lastPositionRef.current = current;
        await SaveWindowPosition(position.x, position.y, size.w, size.h);
        console.log('Window position saved:', current);
      } catch (error) {
        console.error('Failed to save window position:', error);
      }
    };

    // 定期的にウィンドウ位置をチェック
    const handleWindowChange = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(saveWindowPosition, 500);
    };

    // シャットダウン時の保存イベントリスナー
    const unsubscribe = EventsOn('save_window_position', saveWindowPosition);

    // 定期的に位置を監視（2秒ごと）
    const interval = setInterval(handleWindowChange, 2000);

    // クリーンアップ
    return () => {
      unsubscribe();
      clearInterval(interval);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return (
    <SettingsProvider>
      <div className="min-h-screen bg-gray-900">
        <SettingsPage />
        <Toaster position="top-right" richColors expand={true} duration={3000} />
      </div>
    </SettingsProvider>
  );
}

export default App;