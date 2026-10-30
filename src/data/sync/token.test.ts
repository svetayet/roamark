import {
  YA_CLIENT_ID,
  buildAuthUrl,
  captureTokenFromLocation,
  clearToken,
  getToken,
  hasToken,
} from './token';

const SITE = 'https://svetayet.github.io/roamark/';

test('buildAuthUrl содержит client_id, scope, redirect_uri, response_type=token', () => {
  const url = new URL(buildAuthUrl());
  expect(url.origin + url.pathname).toBe('https://oauth.yandex.ru/authorize');
  expect(url.searchParams.get('response_type')).toBe('token');
  expect(url.searchParams.get('client_id')).toBe(YA_CLIENT_ID);
  expect(url.searchParams.get('redirect_uri')).toBe(SITE);
  expect(url.searchParams.get('scope')).toBe('cloud_api:disk.app_folder');
});

test('capture забирает access_token из hash и стирает фрагмент', () => {
  window.location.hash = '#access_token=y0-secret&token_type=bearer';
  captureTokenFromLocation();
  expect(window.location.hash).toBe('');
  expect(window.location.href).not.toContain('y0-secret'); // токен не остался в адресе
  expect(getToken()).toBe('y0-secret');
  expect(hasToken()).toBe(true);
});

test('getToken после capture отдаёт токен, после clearToken — null', () => {
  window.location.hash = '#access_token=one';
  captureTokenFromLocation();
  clearToken();
  expect(getToken()).toBeNull();
  expect(hasToken()).toBe(false);
});

test('повторный capture без фрагмента не меняет токен', () => {
  window.location.hash = '#access_token=first';
  captureTokenFromLocation();
  window.location.hash = '#/settings'; // обычная навигация HashRouter
  captureTokenFromLocation();
  expect(getToken()).toBe('first');
});

test('токен не попадает ни в одно хранилище', () => {
  window.location.hash = '#access_token=y0-x';
  captureTokenFromLocation();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});
