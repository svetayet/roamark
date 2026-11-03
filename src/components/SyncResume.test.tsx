import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { SyncResume } from './SyncResume';
import { RepoProvider } from '../data/RepoContext';
import type { TrackRepository } from '../data/repository';

const runner = vi.hoisted(() => ({ pending: null as string | null }));

vi.mock('../data/sync/runner', () => ({
  resumeIfPending: vi.fn(() => runner.pending),
}));

/** Репозиторий-заглушка: компоненту он нужен только как аргумент resumeIfPending. */
function fakeRepo() {
  return {
    getMeta: async () => null,
    setMeta: async () => undefined,
  } as unknown as TrackRepository;
}

function mount() {
  return render(
    <RepoProvider repo={fakeRepo()}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<><SyncResume /><span>главная открыта</span></>} />
          <Route path="/settings" element={<><SyncResume /><span>настройки открыты</span></>} />
        </Routes>
      </MemoryRouter>
    </RepoProvider>,
  );
}

beforeEach(() => {
  runner.pending = null;
});

test('после возврата с oauth в настройки — автопереход туда, откуда ушли', async () => {
  runner.pending = 'settings';
  mount();
  expect(await screen.findByText('настройки открыты')).toBeTruthy();
});

test('нечего продолжать — остаёмся на месте', () => {
  runner.pending = null;
  mount();
  expect(screen.getByText('главная открыта')).toBeTruthy();
  expect(screen.queryByText('настройки открыты')).toBeNull();
});
