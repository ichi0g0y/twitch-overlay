import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SettingsPage } from './components/SettingsPage';
import { NotificationWindow } from './components/notification/NotificationWindow';
import { Toaster } from 'sonner';
import { SettingsProvider } from './contexts/SettingsContext';
import { Events, Window as WailsWindow } from '@wailsio/runtime';
import * as WailsApp from '../bindings/github.com/ichi0g0y/twitch-overlay/app.js';

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
    <Routes>
      {/* Settings Page Route */}
      <Route
        path="/"
        element={
          <SettingsProvider>
            <div className="min-h-screen bg-gray-900">
              <SettingsPage />
              <Toaster position="top-right" richColors expand={true} duration={3000} />
            </div>
          </SettingsProvider>
        }
      />

      {/* Notification Window Route */}
      <Route path="/notification" element={<NotificationWindow />} />
    </Routes>
  );
}

export default App;