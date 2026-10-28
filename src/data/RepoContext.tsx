import { createContext, useContext, type ReactNode } from 'react';
import { InMemoryTrackRepository } from './memory';
import type { TrackRepository } from './repository';

/**
 * Выбор реализации хранилища: с настроенным Supabase — она,
 * без — демо-репозиторий в памяти.
 * TODO(Task 9): сюда подключается SupabaseTrackRepository из ./supabase/repository.
 */
function createDefaultRepo(): TrackRepository {
  if (import.meta.env.VITE_SUPABASE_URL) {
    // До Task 9 работаем на демо-данных даже с заданным URL,
    // чтобы приложение оставалось живым.
    return new InMemoryTrackRepository({ demo: true });
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
