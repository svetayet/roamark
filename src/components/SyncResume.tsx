import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';
import type { SyncRepo } from '../data/sync/sync';
import { resumeIfPending } from '../data/sync/runner';

/**
 * Продолжить синхронизацию, прерванную тихим уходом на oauth.yandex.ru
 * (маркер ожидания runner'а). Держится внутри HashRouter, чтобы вернуть
 * владелицу на ту страницу, откуда она уходила. Ничего не рисует.
 */
export function SyncResume() {
  const repo = useRepo() as unknown as SyncRepo;
  const navigate = useNavigate();

  useEffect(() => {
    const origin = resumeIfPending(repo);
    if (origin === 'settings') navigate('/settings', { replace: true });
  }, [repo, navigate]);

  return null;
}
