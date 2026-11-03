import { beforeEach, expect, test, vi } from 'vitest';
import type { SyncRepo } from './sync';

const token = vi.hoisted(() => ({ has: false, connected: false }));

vi.mock('./token', () => ({
  buildAuthUrl: () => 'https://oauth.yandex.ru/authorize?test',
  getToken: () => (token.has ? 'tok' : null),
  isConnected: () => token.has || token.connected,
  disconnect: () => {
    token.has = false;
    token.connected = false;
  },
}));

const sync = vi.hoisted(() => ({
  report: { summary: () => 'синхронизировано · забрано 1, выложено 2' } as never,
}));

vi.mock('./sync', () => ({
  synchronize: vi.fn(async () => sync.report),
}));

vi.mock('./relay', () => ({
  RelayClient: class {
    constructor(
      public baseUrl: string,
      public token: string,
    ) {}
  },
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

import { SyncError } from './relay';
import {
  clearOutcome,
  defaultRelayUrl,
  getRunnerState,
  resumeIfPending,
  startSync,
} from './runner';
import { synchronize } from './sync';

/** Репозиторий-заглушка: движку он нужен только как аргумент synchronize. */
const fakeRepo = {} as SyncRepo;

/** jsdom не даёт перезаписать location штатно — только через снимок типа. */
function fakeLocation() {
  const w = window as unknown as { location?: { href: string } };
  delete w.location;
  w.location = { href: 'https://svetayet.github.io/roamark/' };
}

const AUTH_URL = 'https://oauth.yandex.ru/authorize?test';
const PENDING_KEY = 'roamark.syncPending';

beforeEach(() => {
  token.has = false;
  token.connected = false;
  sessionStorage.clear();
  localStorage.clear();
  clearOutcome();
  vi.mocked(synchronize).mockReset();
  vi.mocked(synchronize).mockImplementation(async () => sync.report);
});

test('запуск с живым токеном синхронизирует и кладёт сводку', async () => {
  token.has = true;
  await startSync('settings', fakeRepo, 'https://api.example.ru');
  expect(synchronize).toHaveBeenCalledTimes(1);
  expect(getRunnerState().report).toBe('синхронизировано · забрано 1, выложено 2');
  expect(getRunnerState().busy).toBe(false);
  expect(getRunnerState().error).toBeNull();
});

test('пока синхронизация идёт — busy, повторный запуск игнорируется', async () => {
  token.has = true;
  let finish!: () => void;
  vi.mocked(synchronize).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(sync.report);
      }),
  );
  const first = startSync('settings', fakeRepo, 'https://api.example.ru');
  expect(getRunnerState().busy).toBe(true);
  const second = startSync('settings', fakeRepo, 'https://api.example.ru');
  finish();
  await Promise.all([first, second]);
  expect(synchronize).toHaveBeenCalledTimes(1);
  expect(getRunnerState().busy).toBe(false);
});

test('без токена, но с флагом — тихий уход на oauth с маркером ожидания', async () => {
  fakeLocation();
  token.connected = true;
  await startSync('settings', fakeRepo, 'https://api.example.ru');
  expect(window.location.href).toBe(AUTH_URL);
  expect(sessionStorage.getItem(PENDING_KEY)).toBe('settings');
  expect(synchronize).not.toHaveBeenCalled();
  expect(getRunnerState().busy).toBe(false);
});

test('ни токена, ни флага — ошибка, никуда не уходим', async () => {
  fakeLocation();
  await startSync('settings', fakeRepo, 'https://api.example.ru');
  expect(window.location.href).toBe('https://svetayet.github.io/roamark/');
  expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  expect(synchronize).not.toHaveBeenCalled();
  expect(getRunnerState().error).not.toBeNull();
});

test('успешный запуск из шапки сводку не показывает', async () => {
  token.has = true;
  await startSync('header', fakeRepo, 'https://api.example.ru');
  expect(synchronize).toHaveBeenCalledTimes(1);
  expect(getRunnerState().report).toBeNull();
  expect(getRunnerState().lastOrigin).toBe('header');
});

test('resume: маркер и токен — автопродолжение, настройкам вернуть origin', async () => {
  token.has = true;
  sessionStorage.setItem(PENDING_KEY, 'settings');
  const origin = resumeIfPending(fakeRepo);
  expect(origin).toBe('settings');
  expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  await vi.waitFor(() => expect(getRunnerState().busy).toBe(false));
  expect(synchronize).toHaveBeenCalledTimes(1);
  expect(getRunnerState().report).toBe('синхронизировано · забрано 1, выложено 2');
});

test('resume без маркера — ничего не делает', () => {
  token.has = true;
  expect(resumeIfPending(fakeRepo)).toBeNull();
  expect(synchronize).not.toHaveBeenCalled();
});

test('resume с маркером, но без токена — маркер забывается без запуска', () => {
  sessionStorage.setItem(PENDING_KEY, 'header');
  expect(resumeIfPending(fakeRepo)).toBeNull();
  expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  expect(synchronize).not.toHaveBeenCalled();
});

test('срыв сессии при обычном запуске — одна тихая переподключалка', async () => {
  fakeLocation();
  token.has = true;
  vi.mocked(synchronize).mockRejectedValueOnce(new SyncError('token', 'протух'));
  await startSync('settings', fakeRepo, 'https://api.example.ru');
  expect(window.location.href).toBe(AUTH_URL);
  expect(sessionStorage.getItem(PENDING_KEY)).toBe('settings');
  expect(getRunnerState().busy).toBe(false);
  expect(getRunnerState().error).toBeNull();
});

test('срыв сессии при автопродолжении — ошибка вместо нового ухода, без зацикливания', async () => {
  fakeLocation();
  token.has = true;
  sessionStorage.setItem(PENDING_KEY, 'settings');
  vi.mocked(synchronize).mockRejectedValueOnce(new SyncError('token', 'опять протух'));
  expect(resumeIfPending(fakeRepo)).toBe('settings');
  await vi.waitFor(() => expect(getRunnerState().busy).toBe(false));
  expect(window.location.href).toBe('https://svetayet.github.io/roamark/');
  expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  expect(getRunnerState().error).toBe('ошибка: token');
});

test('ошибка сети — человекочитаемый текст в состоянии', async () => {
  token.has = true;
  vi.mocked(synchronize).mockRejectedValueOnce(new SyncError('network', 'нет сети'));
  await startSync('header', fakeRepo, 'https://api.example.ru');
  expect(getRunnerState().error).toBe('ошибка: network');
  expect(getRunnerState().busy).toBe(false);
});

test('clearOutcome чистит сводку и ошибку', async () => {
  token.has = true;
  vi.mocked(synchronize).mockRejectedValueOnce(new SyncError('network', 'нет сети'));
  await startSync('header', fakeRepo, 'https://api.example.ru');
  expect(getRunnerState().error).not.toBeNull();
  clearOutcome();
  expect(getRunnerState().error).toBeNull();
  expect(getRunnerState().report).toBeNull();
});

test('адрес реле берётся из localStorage', () => {
  localStorage.setItem('roamark.relayUrl', 'https://api.example.ru');
  expect(defaultRelayUrl()).toBe('https://api.example.ru');
});
