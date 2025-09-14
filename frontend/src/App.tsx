import { SettingsPage } from './components/SettingsPage';
import { Toaster } from 'sonner';
import { SettingsProvider } from './contexts/SettingsContext';

function App() {
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