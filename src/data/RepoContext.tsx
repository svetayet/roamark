import { createContext, useContext, type ReactNode } from 'react';
import { InMemoryTrackRepository } from './memory';
import { createSupabaseRepository } from './supabase/repository';
import type { TrackRepository } from './repository';

/**
 * Выбор реализации хранилища: настроен Supabase — она,
 * нет — демо-репозиторий в памяти. Ключи читаются только здесь и в client.ts.
 */
function createDefaultRepo(): TrackRepository {
  if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return createSupabaseRepository();
  }
  return new InMemoryTrackRepository({ demo: true });
}

const RepoContext = createContext<TrackRepository | null>(null);

/** repo — точечная подмена (тесты); без неё — выбор по окружению. */
export function RepoProvider({ children, repo }: { children: ReactNode; repo?: TrackRepository }) {
  return <RepoContext.Provider value={repo ?? defaultRepo}>{children}</RepoContext.Provider>;
}

const defaultRepo = createDefaultRepo();

export function useRepo(): TrackRepository {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error('useRepo вне RepoProvider');
  return repo;
}
