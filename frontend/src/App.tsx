import { Routes, Route } from 'react-router-dom';
import { SettingsPage } from './components/SettingsPage';
import { NotificationWindow } from './components/notification/NotificationWindow';
import { Toaster } from 'sonner';
import { SettingsProvider } from './contexts/SettingsContext';

function App() {
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
