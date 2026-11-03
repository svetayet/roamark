import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { AppHeader } from './AppHeader';
import { RepoProvider } from '../data/RepoContext';
import { clearOutcome } from '../data/sync/runner';
import type { TrackRepository } from '../data/repository';

const token = vi.hoisted(() => ({ has: false, connected: false }));
const sync = vi.hoisted(() => ({ lastReport: { summary: () => 'синхронизировано · забрано 1, выложено 2' } as never }));

vi.mock('../data/sync/token', () => ({
  buildAuthUrl: () => 'https://oauth.yandex.ru/authorize?test',
  getToken: () => (token.has ? 'tok' : null),
  isConnected: () => token.has || token.connected,
  disconnect: () => {
    token.has = false;
    token.connected = false;
  },
}));

vi.mock('../data/sync/relay', () => ({
  RelayClient: class {},
  SyncError: class extends Error {
    constructor(
      public failure: 'token' | 'missing' | 'relay' | 'network' = 'network',
      message?: string,
    ) {
      super(message ?? failure);
    }
  },
  syncErrorText: (e: { failure: string }) => `ошибка: ${e.failure}`,
}));

vi.mock('../data/sync/sync', () => ({
  synchronize: vi.fn(async () => sync.lastReport),
}));

/** Репозиторий-заглушка: шапке он нужен только как аргумент runner'а. */
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
          <Route path="/" element={<><AppHeader /><span>главная открыта</span></>} />
          <Route path="/settings" element={<><AppHeader /><span>настройки открыты</span></>} />
        </Routes>
      </MemoryRouter>
    </RepoProvider>,
  );
}

beforeEach(async () => {
  token.has = false;
  token.connected = false;
  sessionStorage.clear();
  localStorage.clear();
  clearOutcome();
  const { synchronize } = await import('../data/sync/sync');
  vi.mocked(synchronize).mockReset();
  vi.mocked(synchronize).mockImplementation(async () => sync.lastReport);
});

test('не подключено — кнопка синхронизации ведёт в настройки', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Синхронизация' }));
  expect(await screen.findByText('настройки открыты')).toBeTruthy();
});

test('подключено — запуск синхронизации без отчёта «сколько куда»', async () => {
  token.has = true;
  const { synchronize } = await import('../data/sync/sync');
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Синхронизация' }));
  await waitFor(() => expect(synchronize).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Синхронизация' }) as HTMLButtonElement).disabled).toBe(false),
  );
  expect(screen.queryByText(/синхронизировано/)).toBeNull();
});

test('во время синхронизации кнопка выключена и помечена busy', async () => {
  token.has = true;
  const { synchronize } = await import('../data/sync/sync');
  let finish!: () => void;
  vi.mocked(synchronize).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(sync.lastReport);
      }),
  );
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Синхронизация' }));
  const busyBtn = await screen.findByRole('button', { name: 'Синхронизация' });
  expect((busyBtn as HTMLButtonElement).disabled).toBe(true);
  expect(busyBtn.className).toContain('app-header__btn--busy');
  finish();
  await waitFor(() => {
    const btn = screen.getByRole('button', { name: 'Синхронизация' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.className).not.toContain('app-header__btn--busy');
  });
});

test('неудачный запуск из шапки — подсказка об ошибке', async () => {
  token.has = true;
  const { synchronize } = await import('../data/sync/sync');
  const { SyncError } = await import('../data/sync/relay');
  vi.mocked(synchronize).mockRejectedValueOnce(new SyncError('network', 'нет сети'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Синхронизация' }));
  expect(await screen.findByText('ошибка: network')).toBeTruthy();
});
