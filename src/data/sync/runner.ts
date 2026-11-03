import { buildAuthUrl, getToken, isConnected } from './token';
import { RelayClient, SyncError, syncErrorText } from './relay';
import { synchronize, type SyncRepo } from './sync';

/**
 * Общий движок синхронизации для настроек и шапки. Токен нигде не хранится:
 * если факт подключения стоит, а токена в памяти нет — тихий заход на
 * oauth.yandex.ru за новым (права уже выданы, Яндекс возвращает молча),
 * а после возврата автопродолжение по маркеру ожидания в sessionStorage.
 * Маркер хранит, откуда нажали: настройкам — отчёт «сколько куда», шапке — тишину.
 */

export type SyncOrigin = 'settings' | 'header';

export interface RunnerState {
  busy: boolean;
  /** Сводка последней синхронизации — только для запуска из настроек. */
  report: string | null;
  /** Ошибка последнего запуска, текстом для человека. */
  error: string | null;
  lastOrigin: SyncOrigin | null;
}

const PENDING_KEY = 'roamark.syncPending';
export const RELAY_URL_KEY = 'roamark.relayUrl';

let state: RunnerState = { busy: false, report: null, error: null, lastOrigin: null };
const listeners = new Set<() => void>();

function set(patch: Partial<RunnerState>): void {
  state = { ...state, ...patch };
  listeners.forEach((notify) => notify());
}

export function getRunnerState(): RunnerState {
  return state;
}

export function subscribeRunner(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** «Отключить» и новые запуски начинают с чистого листа. */
export function clearOutcome(): void {
  set({ report: null, error: null, lastOrigin: null });
}

/** Адрес реле: из localStorage поверх дефолта сборки (как было в настройках). */
export function defaultRelayUrl(): string {
  const envUrl = import.meta.env.VITE_RELAY_URL ?? '';
  return localStorage.getItem(RELAY_URL_KEY) ?? envUrl;
}

/** Маркер «синхронизация ждёт»: переживёт уход на oauth и возврат, умрёт с вкладкой. */
function setPending(origin: SyncOrigin): void {
  try {
    sessionStorage.setItem(PENDING_KEY, origin);
  } catch {
    /* нет стореджа — просто спросим токен по клику ещё раз */
  }
}

function goAuth(): void {
  window.location.href = buildAuthUrl();
}

export async function startSync(
  origin: SyncOrigin,
  repo: SyncRepo,
  relayUrl: string,
  opts: { autoRetried?: boolean } = {},
): Promise<void> {
  if (state.busy) return;
  set({ busy: true, report: null, error: null, lastOrigin: origin });

  const token = getToken();
  if (token === null) {
    if (!isConnected()) {
      set({ busy: false, error: 'Яндекс.Диск не подключён — подключи его в настройках.' });
      return;
    }
    // Права уже выданы — Яндекс вернёт молча, продолжит resumeIfPending().
    setPending(origin);
    set({ busy: false });
    goAuth();
    return;
  }

  try {
    const report = await synchronize(repo, new RelayClient(relayUrl.replace(/\/+$/, ''), token));
    set({ busy: false, report: origin === 'settings' ? report.summary() : null });
  } catch (e) {
    if (e instanceof SyncError && e.failure === 'token' && !opts.autoRetried) {
      // Одна тихая переподключалка за запуск: второй срыв уже не лечится редиректом.
      setPending(origin);
      set({ busy: false });
      goAuth();
      return;
    }
    set({ busy: false, error: syncErrorText(e) });
  }
}

/**
 * Продолжить прерванную синхронизацию после возврата с oauth (маркер уже с
 * токеном в адресе). Возвращает, откуда была нажата кнопка, или null.
 */
export function resumeIfPending(repo: SyncRepo): SyncOrigin | null {
  let pending: string | null = null;
  try {
    pending = sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (pending !== 'settings' && pending !== 'header') return null;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* маркер одноразовый, но и без удаления повтор не случится — вкладка уже вернулась */
  }
  if (getToken() === null) return null; // Яндекс вернул без токена — забываем
  void startSync(pending, repo, defaultRelayUrl(), { autoRetried: true });
  return pending;
}

/** Первое подключение из настроек: маркер, чтобы после возврата сразу синхронизироваться. */
export function startConnect(): void {
  setPending('settings');
  goAuth();
}
