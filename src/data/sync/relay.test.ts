import { RelayClient, SyncError } from './relay';

const OK_HEALTH = { status: 'ok', time: '2026-10-30T10:00:00Z' };

/** Мок fetch: маршрут (метод, url) → {status, body, json?}. */
function mockFetch(routes: Record<string, { status: number; body?: string; json?: unknown }>) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${input}`;
    const route = routes[key];
    if (!route) throw new Error(`нет маршрута: ${key}`);
    return new Response(route.json !== undefined ? JSON.stringify(route.json) : (route.body ?? ''), {
      status: route.status,
      headers: { 'Content-Type': route.json !== undefined ? 'application/json' : 'application/octet-stream' },
    });
  }) as typeof fetch;
}

test('health проходит без токена', async () => {
  const relay = new RelayClient('https://relay', '', mockFetch({ 'GET https://relay/v1/health': { status: 200, json: OK_HEALTH } }));
  expect(await relay.health()).toEqual(OK_HEALTH);
});

test('listFiles маппит files и шлёт Bearer-токен', async () => {
  let seenAuth = '';
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seenAuth = (init?.headers as Record<string, string>)['Authorization'] ?? '';
    return new Response(JSON.stringify({ files: [{ name: 'a.gpx', size: 1, modified: 'm' }] }), { status: 200 });
  }) as typeof fetch;
  const relay = new RelayClient('https://relay', 'tok', fetchImpl);
  const files = await relay.listFiles('tracks');
  expect(files).toEqual([{ name: 'a.gpx', size: 1, modified: 'm' }]);
  expect(seenAuth).toBe('Bearer tok');
});

test('401 → failure token', async () => {
  const relay = new RelayClient('https://relay', 'tok', mockFetch({
    'GET https://relay/v1/files?prefix=tracks': { status: 401, json: { message: 'Токен Яндекса протух или не тот.' } },
  }));
  await expect(relay.listFiles('tracks')).rejects.toMatchObject({ failure: 'token' });
});

test('502 с message → failure relay и русский текст', async () => {
  const relay = new RelayClient('https://relay', 'tok', mockFetch({
    'GET https://relay/v1/files?prefix=tracks': { status: 502, json: { message: 'Яндекс вернул 500: boom' } },
  }));
  const err: unknown = await relay.listFiles('tracks').catch((e) => e);
  expect(err).toBeInstanceOf(SyncError);
  expect((err as SyncError).failure).toBe('relay');
  expect((err as SyncError).message).toContain('Яндекс вернул 500');
});

test('404 на getFile → failure missing', async () => {
  const relay = new RelayClient('https://relay', 'tok', mockFetch({
    'GET https://relay/v1/file?path=tracks%2Fx.gpx': { status: 404, json: { message: 'Такого файла нет на Диске.' } },
  }));
  await expect(relay.getFile('tracks/x.gpx')).rejects.toMatchObject({ failure: 'missing' });
});;

test('сетевой отказ → failure network', async () => {
  const dead = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
  const relay = new RelayClient('https://relay', 'tok', dead);
  await expect(relay.listFiles('tracks')).rejects.toMatchObject({ failure: 'network' });
});

test('putFile отправляет байты и Authorization', async () => {
  let seen: { auth?: string; body?: ArrayBuffer } = {};
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen = { auth: (init?.headers as Record<string, string>)['Authorization'], body: await new Request(input, init).arrayBuffer() };
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const relay = new RelayClient('https://relay', 'tok', fetchImpl);
  await relay.putFile('tracks/x.gpx', new TextEncoder().encode('лес').buffer);
  expect(seen.auth).toBe('Bearer tok');
  expect(new TextDecoder().decode(seen.body!)).toBe('лес');
});
