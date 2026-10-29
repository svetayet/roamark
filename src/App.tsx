import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RepoProvider } from './data/RepoContext';
import { ThemeProvider } from './theme/theme';
import { HomePage } from './pages/HomePage';
import { AddTrackPage } from './pages/AddTrackPage';
import { TrackPage } from './pages/TrackPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <ThemeProvider>
      <RepoProvider>
        <HashRouter>
          <div className="app">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/track/:id" element={<TrackPage />} />
              <Route path="/add" element={<AddTrackPage />} />
              <Route path="/add/:trackId" element={<AddTrackPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </HashRouter>
      </RepoProvider>
    </ThemeProvider>
  );
}
