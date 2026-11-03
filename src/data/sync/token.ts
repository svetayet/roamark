/**
 * OAuth-токен Яндекса: живёт ТОЛЬКО в памяти открытой вкладки.
 * После согласия Яндекс возвращает владелицу на сайт с фрагментом
 * #access_token=… — HashRouter счёл бы его маршрутом и тут же затёр,
 * поэтому captureTokenFromLocation() вызывается в main.tsx до рендера.
 * В localStorage и любую историю токен не попадает никогда
 * (принцип владелицы: «хранить токен в данных браузера не безопасно вообще»).
 *
 * В localStorage лежит только ФАКТ подключения (roamark.yaConnected) —
 * не токен. По нему новая вкладка знает «Диск подключён», а токен
 * запрашивается заново тихим заходом на oauth.yandex.ru при синхронизации.
 */

export const YA_CLIENT_ID = '4be515d1418c48c0bb50fbd1424bd63e';
const REDIRECT_URI = 'https://svetayet.github.io/roamark/';
const SCOPE = 'cloud_api:disk.app_folder';
const CONNECTED_KEY = 'roamark.yaConnected';

/** Куда вести кнопку «подключить Яндекс.Диск». */
export function buildAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: YA_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
  });
  return `https://oauth.yandex.ru/authorize?${params.toString()}`;
}

let token: string | null = null;

/** Забрать #access_token=… из адреса в память и стереть фрагмент. Один раз на заход. */
export function captureTokenFromLocation(): void {
  const match = window.location.hash.match(/access_token=([^&]+)/);
  if (match) {
    token = decodeURIComponent(match[1]);
    // Запомнить факт подключения; сам токен — только в памяти, как выше.
    try {
      localStorage.setItem(CONNECTED_KEY, '1');
    } catch {
      /* приватный режим: флаг — удобство, без него просто чаще спросим токен */
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/** Подключён ли Диск на этом устройстве: токен в памяти или флаг прошлого подключения. */
export function isConnected(): boolean {
  let flagged = false;
  try {
    flagged = localStorage.getItem(CONNECTED_KEY) === '1';
  } catch {
    /* нет доступа к стореджу — считаем только живой токен */
  }
  return token !== null || flagged;
}

export function getToken(): string | null {
  return token;
}

/** «Отключить» в настройках: забыть и токен, и факт подключения. */
export function disconnect(): void {
  token = null;
  try {
    localStorage.removeItem(CONNECTED_KEY);
  } catch {
    /* не критично: без стореджа флаг и так не читается */
  }
}
