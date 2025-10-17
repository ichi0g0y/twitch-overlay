import { useEffect } from 'react';
import { SettingsPage } from './components/SettingsPage';
import { Toaster } from 'sonner';
import { SettingsProvider } from './contexts/SettingsContext';
import { Events, Window as WailsWindow } from '@wailsio/runtime';
import * as WailsApp from '../bindings/github.com/nantokaworks/twitch-overlay/app.js';

function App() {
  useEffect(() => {
    // シャットダウン時のウィンドウ位置保存
    const saveWindowPosition = async () => {
      try {
        const position = await WailsWindow.GetPosition();
        const size = await WailsWindow.GetSize();
        await WailsApp.SaveWindowPosition(position.x, position.y, size.w, size.h);
        console.log('Window position saved on shutdown:', { x: position.x, y: position.y, w: size.w, h: size.h });
      } catch (error) {
        console.error('Failed to save window position on shutdown:', error);
      }
    };

    // シャットダウン時の保存イベントリスナー
    const unsubscribe = Events.On('save_window_position', saveWindowPosition);

    // クリーンアップ
    return () => {
      unsubscribe();
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