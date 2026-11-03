import { beforeEach, expect, test, vi } from 'vitest';
import { YA_CLIENT_ID, buildAuthUrl } from './token';

/**
 * Модуль держит токен в переменной уровня модуля — для чистоты тестов
 * пересоздаём его на каждый тест.
 */
async function fresh() {
  vi.resetModules();
  return await import('./token');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});

test('buildAuthUrl содержит client_id, scope, redirect_uri, response_type=token', () => {
  const url = new URL(buildAuthUrl());
  expect(url.origin + url.pathname).toBe('https://oauth.yandex.ru/authorize');
  expect(url.searchParams.get('response_type')).toBe('token');
  expect(url.searchParams.get('client_id')).toBe(YA_CLIENT_ID);
  expect(url.searchParams.get('redirect_uri')).toBe('https://svetayet.github.io/roamark/');
  expect(url.searchParams.get('scope')).toBe('cloud_api:disk.app_folder');
});

test('capture забирает access_token из hash и стирает фрагмент', async () => {
  const t = await fresh();
  window.location.hash = '#access_token=y0-secret&token_type=bearer';
  t.captureTokenFromLocation();
  expect(window.location.hash).toBe('');
  expect(window.location.href).not.toContain('y0-secret'); // токен не остался в адресе
  expect(t.getToken()).toBe('y0-secret');
});

test('повторный capture без фрагмента не меняет токен', async () => {
  const t = await fresh();
  window.location.hash = '#access_token=first';
  t.captureTokenFromLocation();
  window.location.hash = '#/settings'; // обычная навигация HashRouter
  t.captureTokenFromLocation();
  expect(t.getToken()).toBe('first');
});

test('после возврата с Яндекса в localStorage остаётся только факт подключения', async () => {
  const t = await fresh();
  window.location.hash = '#access_token=y0_AbC&token_type=bearer';
  t.captureTokenFromLocation();
  expect(localStorage.getItem('roamark.yaConnected')).toBe('1');
  expect(t.isConnected()).toBe(true);
});

test('флаг «подключено» живёт без токена — как в новой вкладке', async () => {
  const t = await fresh();
  localStorage.setItem('roamark.yaConnected', '1');
  expect(t.isConnected()).toBe(true);
  expect(t.getToken()).toBeNull();
});

test('без флага и без токена — не подключено', async () => {
  const t = await fresh();
  expect(t.isConnected()).toBe(false);
});

test('отключить стирает и токен, и флаг', async () => {
  const t = await fresh();
  window.location.hash = '#access_token=y0_AbC';
  t.captureTokenFromLocation();
  t.disconnect();
  expect(t.getToken()).toBeNull();
  expect(localStorage.getItem('roamark.yaConnected')).toBeNull();
  expect(t.isConnected()).toBe(false);
});

test('возврат без access_token флаг не трогает', async () => {
  const t = await fresh();
  localStorage.setItem('roamark.yaConnected', '1');
  window.location.hash = '#error=access_denied';
  t.captureTokenFromLocation();
  expect(localStorage.getItem('roamark.yaConnected')).toBe('1');
  expect(t.getToken()).toBeNull();
  expect(t.isConnected()).toBe(true);
});

test('токен не попадает ни в одно хранилище — там только флаг', async () => {
  const t = await fresh();
  window.location.hash = '#access_token=y0-x';
  t.captureTokenFromLocation();
  // Единственная запись — факт подключения, и в ней нет самого токена.
  expect(sessionStorage.length).toBe(0);
  expect(localStorage.length).toBe(1);
  expect(localStorage.getItem('roamark.yaConnected')).toBe('1');
  expect(window.location.href).not.toContain('y0-x');
});
