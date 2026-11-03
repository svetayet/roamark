import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brand } from './Brand';
import { useScrolled } from './useScrolled';
import { SyncIcon } from './icons';
import { useRepo } from '../data/RepoContext';
import type { SyncRepo } from '../data/sync/sync';
import { defaultRelayUrl, getRunnerState, startSync, subscribeRunner } from '../data/sync/runner';
import { isConnected } from '../data/sync/token';

/**
 * Общая шапка всех страниц: кликабельный логотип (на главную), кнопка
 * синхронизации (общий с настройками движок runner.ts — без отчёта
 * «сколько куда», тот только в настройках; пока идёт — иконка крутится),
 * добавление трека и настройки.
 */
export function AppHeader() {
  const navigate = useNavigate();
  const scrolled = useScrolled();
  const repo = useRepo() as unknown as SyncRepo;
  const runner = useSyncExternalStore(subscribeRunner, getRunnerState);
  const [hint, setHint] = useState<string | null>(null);

  // Неудачный шапочный запуск мелькает подсказкой у шапки: молчаливый провал хуже видимой ошибки.
  useEffect(() => {
    if (!runner.error || runner.lastOrigin !== 'header') return;
    setHint(runner.error);
    const timer = setTimeout(() => setHint(null), 4000);
    return () => clearTimeout(timer);
  }, [runner.error, runner.lastOrigin]);

  const sync = () => {
    if (!isConnected()) {
      navigate('/settings');
      return;
    }
    void startSync('header', repo, defaultRelayUrl());
  };

  return (
    <header className={`app-header${scrolled ? ' app-header--lined' : ''}`}>
      <button
        className="app-header__brand"
        onClick={() => navigate('/')}
        aria-label="roaMark — на главную"
        title="на главную"
      >
        <Brand />
      </button>
      <span className="app-header__spacer" />
      <button
        className="app-header__btn app-header__btn--add"
        onClick={() => navigate('/add')}
        aria-label="Добавить трек"
        title="Добавить трек"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
      <button
        className={`app-header__btn${runner.busy ? ' app-header__btn--busy' : ''}`}
        onClick={sync}
        aria-label="Синхронизация"
        title="Синхронизация"
        disabled={runner.busy}
      >
        <SyncIcon />
      </button>
      <button
        className="app-header__btn"
        onClick={() => navigate('/settings')}
        aria-label="Настройки"
        title="Настройки"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
        </svg>
      </button>
      {hint && (
        <div className="app-header__hint" role="status">
          {hint}
        </div>
      )}
    </header>
  );
}
