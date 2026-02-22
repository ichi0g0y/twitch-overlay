import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { SettingsPage } from './components/SettingsPage';
import { NotificationWindow } from './components/notification/NotificationWindow';
import { TraySettingsWindow } from './components/TraySettingsWindow';
import { Toaster } from 'sonner';
import { SettingsProvider } from './contexts/SettingsContext';
import { MicCaptionStatusProvider } from './contexts/MicCaptionStatusContext';

function App() {
  const location = useLocation();

  useEffect(() => {
    const isNotificationWindow = location.pathname.startsWith('/notification');
    const backgroundColor = isNotificationWindow ? 'transparent' : '#111827';

    document.documentElement.style.backgroundColor = backgroundColor;
    document.body.style.backgroundColor = backgroundColor;

    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, [location.pathname]);

  return (
    <>
      <Routes>
        {/* Settings Page Route */}
        <Route
          path="/"
          element={
            <SettingsProvider>
              <MicCaptionStatusProvider>
                <div className="min-h-screen bg-gray-900">
                  <SettingsPage />
                </div>
              </MicCaptionStatusProvider>
            </SettingsProvider>
          }
        />

        {/* Notification Window Route */}
        <Route path="/notification" element={<NotificationWindow />} />
        <Route path="/tray-settings" element={<TraySettingsWindow />} />
      </Routes>
      <Toaster position="top-right" richColors expand={true} duration={3000} />
    </>
  );
}

export default App;
