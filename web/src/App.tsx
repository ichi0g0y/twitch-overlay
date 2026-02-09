import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FaxReceiver from './components/FaxReceiver';
import { Toaster } from 'sonner';
import { MusicPlayerProvider } from './contexts/MusicPlayerContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { PresentPage } from './pages/present/PresentPage';
import { MainOverlay } from './pages/MainOverlay';

function App() {
  // Vite の base 設定（production では /overlay/）に追従
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <BrowserRouter basename={basename}>
      <SettingsProvider>
        <Routes>
          {/* オーバーレイページ（MusicPlayerProvider付き） */}
          <Route path="/" element={
            <MusicPlayerProvider>
              <MainOverlay />
            </MusicPlayerProvider>
          } />

          {/* プレゼントルーレットページ */}
          <Route path="/present" element={<PresentPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SettingsProvider>
    </BrowserRouter>
  );
}

export default App;
