import { createContext, useContext, type ReactNode } from 'react';
import { LocalTrackRepository } from './local/repository';
import type { TrackRepository } from './repository';

/** Все данные — локально в браузере (IndexedDB). Никакого входа. */
function createDefaultRepo(): TrackRepository {
  return new LocalTrackRepository();
}

const RepoContext = createContext<TrackRepository | null>(null);

/** repo — точечная подмена (тесты); без неё — локальное хранилище. */
export function RepoProvider({ children, repo }: { children: ReactNode; repo?: TrackRepository }) {
  return <RepoContext.Provider value={repo ?? defaultRepo}>{children}</RepoContext.Provider>;
}

const defaultRepo = createDefaultRepo();

export function useRepo(): TrackRepository {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error('useRepo вне RepoProvider');
  return repo;
}
