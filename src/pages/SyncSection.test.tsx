import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { SyncSection } from './SyncSection';
import { RepoProvider } from '../data/RepoContext';
import type { TrackRepository } from '../data/repository';

const token = vi.hoisted(() => ({ has: false }));
const sync = vi.hoisted(() => ({ lastReport: { summary: () => 'синхронизировано · забрано 1, выложено 2' } as never }));

vi.mock('../data/sync/token', () => ({
  buildAuthUrl: () => 'https://oauth.yandex.ru/authorize?test',
  hasToken: () => token.has,
  getToken: () => (token.has ? 'tok' : null),
  clearToken: () => {
    token.has = false;
  },
}));

vi.mock('../data/sync/relay', () => ({
  RelayClient: class {
    constructor(public baseUrl: string) {}
    async health() {
      if (this.baseUrl === 'https://bad') throw new Error('нет сети');
      return { status: 'ok', time: 't' };
    }
  },
  SyncError: class extends Error {},
  syncErrorText: () => 'Сервер недоступен — проверь связь или адрес сервера.',
}));

vi.mock('../data/sync/sync', () => ({
  synchronize: vi.fn(async () => sync.lastReport),
}));

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

beforeEach(async () => {
  token.has = false;
  localStorage.clear();
  vi.mocked(await import('../data/sync/sync')).synchronize.mockClear();
});

test('без токена — кнопка «подключить Яндекс.Диск» и переход по buildAuthUrl', () => {
  // jsdom не даёт перезаписать location штатно — только через снимок типа.
  const w = window as unknown as { location?: { href: string } };
  delete w.location;
  w.location = { href: 'https://svetayet.github.io/roamark/' };
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'подключить Яндекс.Диск' }));
  expect(w.location?.href).toBe('https://oauth.yandex.ru/authorize?test');
});

test('с токеном — «синхронизироваться» вызывает synchronize и показывает сводку', async () => {
  token.has = true;
  const { synchronize } = await import('../data/sync/sync');
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'синхронизироваться' }));
  await waitFor(() => expect(synchronize).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/синхронизировано/)).toBeTruthy();
  expect(screen.getByText(/забрано 1, выложено 2/)).toBeTruthy();
});

test('последняя синхронизация отображается из meta', async () => {
  token.has = true;
  mount();
  await waitFor(() =>
    expect(screen.getByText(/последняя синхронизация:/).textContent).toMatch('30.10.2026'),
  );
});

test('проверить связь — сервер жив', async () => {
  token.has = true;
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'проверить связь' }));
  expect(await screen.findByText('сервер жив')).toBeTruthy();
});

test('отключить забывает токен и возвращает кнопку подключения', async () => {
  token.has = true;
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'отключить' }));
  expect(await screen.findByRole('button', { name: 'подключить Яндекс.Диск' })).toBeTruthy();
});

test('адрес реле хранится в localStorage', async () => {
  token.has = true;
  mount();
  const input = screen.getByLabelText('адрес сервера синхронизации') as HTMLInputElement;
  fireEvent.input(input, { target: { value: 'https://api.example.ru' } });
  expect(localStorage.getItem('roamark.relayUrl')).toBe('https://api.example.ru');
});
