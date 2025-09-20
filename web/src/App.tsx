import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FaxReceiver from './components/FaxReceiver';
import ClockPage from './components/ClockPage';
import { Toaster } from 'sonner';
import { MusicPlayerProvider } from './contexts/MusicPlayerContext';
import { SettingsProvider } from './contexts/SettingsContext';

function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <Routes>
          {/* オーバーレイページ（MusicPlayerProvider付き） */}
          <Route path="/" element={
            <MusicPlayerProvider>
              <FaxReceiver />
              <Toaster position="top-right" richColors expand={true} duration={3000} />
            </MusicPlayerProvider>
          } />

          {/* 時計専用ページ */}
          <Route path="/clock" element={
            <ClockPage />
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SettingsProvider>
    </BrowserRouter>
  );
}

export default App;