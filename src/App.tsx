import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RepoProvider, useRepo } from './data/RepoContext';
import { ThemeProvider } from './theme/theme';
import { HomePage } from './pages/HomePage';
import { AddTrackPage } from './pages/AddTrackPage';
import { TrackPage } from './pages/TrackPage';

/** Заглушки до Task 8. */
function Stub({ name }: { name: string }) {
  return <div className="page-stub">{name}</div>;
}

function Shell() {
  const repo = useRepo();
  const [checked, setChecked] = useState(false);
  const [session, setSession] = useState<{ email: string } | null>(null);
  const location = useLocation();

  useEffect(() => {
    const refresh = () => repo.getSession().then(setSession);
    refresh().then(() => setChecked(true));
    return repo.onAuth(refresh);
  }, [repo]);

  if (!checked) return null;
  if (!session && location.pathname !== '/login') return <Navigate to="/login" replace />;

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/track/:id" element={<TrackPage />} />
        <Route path="/add" element={<AddTrackPage />} />
        <Route path="/add/:trackId" element={<AddTrackPage />} />
        <Route path="/settings" element={<Stub name="settings" />} />
        <Route path="/login" element={<Stub name="login" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <RepoProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </RepoProvider>
    </ThemeProvider>
  );
}
