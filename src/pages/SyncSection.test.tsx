import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { SyncSection } from './SyncSection';
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
      public failure: 'token' | 'missing' | 'relay' | 'network' = 'token',
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

const AUTH_URL = 'https://oauth.yandex.ru/authorize?test';

/** Репозиторий-заглушка: SyncSection читает только meta. */
function fakeRepo() {
  const meta: Record<string, unknown> = { lastSyncAt: '2026-10-30T19:01:00.000Z' };
  return {
    getMeta: async (k: string) => meta[k] ?? null,
    setMeta: async (k: string, v: unknown) => {
      meta[k] = v;
    },
  } as unknown as TrackRepository;
}

function mount() {
  return render(
    <RepoProvider repo={fakeRepo()}>
      <SyncSection />
    </RepoProvider>,
  );
}

/** jsdom не даёт перезаписать location штатно — только через снимок типа. */
function fakeLocation() {
  const w = window as unknown as { location?: { href: string } };
  delete w.location;
  w.location = { href: 'https://svetayet.github.io/roamark/' };
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

test('не подключено — кнопка «подключить Яндекс.Диск» уводит на oauth с маркером', () => {
  fakeLocation();
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'подключить Яндекс.Диск' }));
  expect(window.location.href).toBe(AUTH_URL);
  expect(sessionStorage.getItem('roamark.syncPending')).toBe('settings');
});

test('подключено по флагу даже без токена — статус и значок синхронизации на месте', () => {
  token.connected = true;
  mount();
  expect(screen.getByText('Яндекс.Диск · подключено')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'синхронизировать' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'подключить Яндекс.Диск' })).toBeNull();
  expect(screen.queryByLabelText('адрес сервера синхронизации')).toBeNull();
});

test('значок с токеном запускает synchronize и показывает сводку «сколько куда»', async () => {
  token.has = true;
  const { synchronize } = await import('../data/sync/sync');
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'синхронизировать' }));
  await waitFor(() => expect(synchronize).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/синхронизировано/)).toBeTruthy();
  expect(screen.getByText(/забрано 1, выложено 2/)).toBeTruthy();
});

test('без токена, но с флагом значок уводит на oauth, не запуская синхронизацию', async () => {
  fakeLocation();
  token.connected = true;
  const { synchronize } = await import('../data/sync/sync');
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'синхронизировать' }));
  expect(window.location.href).toBe(AUTH_URL);
  expect(sessionStorage.getItem('roamark.syncPending')).toBe('settings');
  expect(synchronize).not.toHaveBeenCalled();
});

test('последняя синхронизация отображается из meta', async () => {
  token.has = true;
  mount();
  await waitFor(() =>
    expect(screen.getByText(/последняя синхронизация:/).textContent).toMatch('30.10.2026'),
  );
});

test('отключить забывает подключение и возвращает кнопку', async () => {
  token.connected = true;
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'отключить' }));
  expect(await screen.findByRole('button', { name: 'подключить Яндекс.Диск' })).toBeTruthy();
});

test('срыв сессии — тихий уход на oauth, подключение не сбрасывается', async () => {
  fakeLocation();
  token.has = true;
  const { synchronize } = await import('../data/sync/sync');
  const { SyncError } = await import('../data/sync/relay');
  vi.mocked(synchronize).mockRejectedValueOnce(new SyncError('token', 'Сессия истекла'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'синхронизировать' }));
  await waitFor(() => expect(window.location.href).toBe(AUTH_URL));
  expect(sessionStorage.getItem('roamark.syncPending')).toBe('settings');
  expect(screen.getByText('Яндекс.Диск · подключено')).toBeTruthy();
});

test('ошибка сети — подсказка с текстом, подключение остаётся', async () => {
  token.has = true;
  const { synchronize } = await import('../data/sync/sync');
  const { SyncError } = await import('../data/sync/relay');
  vi.mocked(synchronize).mockRejectedValueOnce(new SyncError('network', 'нет сети'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'синхронизировать' }));
  expect(await screen.findByText('ошибка: network')).toBeTruthy();
  expect(screen.getByText('Яндекс.Диск · подключено')).toBeTruthy();
});

test('пока синхронизация идёт — значок занят, выключен и крутится', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'синхронизировать' }));
  const busyBtn = await screen.findByRole('button', { name: 'синхронизировать' });
  expect((busyBtn as HTMLButtonElement).disabled).toBe(true);
  expect(busyBtn.className).toContain('app-header__btn--busy');
  finish();
  await waitFor(() => {
    const btn = screen.getByRole('button', { name: 'синхронизировать' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.className).not.toContain('app-header__btn--busy');
  });
});
