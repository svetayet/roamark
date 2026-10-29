import { vi } from 'vitest';

test('после согласия Яндекса токен из #access_token=… перехватывается, фрагмент стирается', async () => {
  window.location.hash = '#access_token=y0_abc123&token_type=Bearer';
  vi.resetModules();
  const { takeCapturedToken } = await import('./spikeToken');
  expect(takeCapturedToken()).toBe('y0_abc123');
  // Фрагмент убран из адреса: HashRouter не увидит его маршрутом,
  // и токен не останется в истории браузера.
  expect(window.location.hash).toBe('');
  // Токен одноразовый — второй вызов пуст.
  expect(takeCapturedToken()).toBeNull();
});

test('обычный адрес приложения — токена нет', async () => {
  window.location.hash = '#/settings';
  vi.resetModules();
  const { takeCapturedToken } = await import('./spikeToken');
  expect(takeCapturedToken()).toBeNull();
});
