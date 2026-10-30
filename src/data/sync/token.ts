/**
 * OAuth-токен Яндекса: живёт ТОЛЬКО в памяти открытой вкладки.
 * После согласия Яндекс возвращает владелицу на сайт с фрагментом
 * #access_token=… — HashRouter счёл бы его маршрутом и тут же затёр,
 * поэтому captureTokenFromLocation() вызывается в main.tsx до рендера.
 * В localStorage и любую историю токен не попадает никогда
 * (принцип владелицы: «хранить токен в данных браузера не безопасно вообще»).
 */

export const YA_CLIENT_ID = '4be515d1418c48c0bb50fbd1424bd63e';
const REDIRECT_URI = 'https://svetayet.github.io/roamark/';
const SCOPE = 'cloud_api:disk.app_folder';

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
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

export function hasToken(): boolean {
  return token !== null;
}

export function getToken(): string | null {
  return token;
}

/** «Отключить» в настройках: токен забывается до следующего подключения. */
export function clearToken(): void {
  token = null;
}
