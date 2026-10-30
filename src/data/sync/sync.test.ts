import type { SyncRecord } from '../local/repository';
import { buildManifest, type Manifest } from './manifest';
import { synchronize, type SyncRepo, type SyncRelay } from './sync';
import { SyncError } from './relay';

const T = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`;

function district(id: string, extra: Partial<SyncRecord> = {}): SyncRecord {
  return { id, kind: 'district', name: id, isPrimary: true, updatedAt: T(20), deletedAt: null, ...extra };
}

function track(id: string, extra: Partial<SyncRecord> = {}): SyncRecord {
  return {
    id,
    kind: 'track',
    districtId: 'd1',
    name: `трек ${id}`,
    category: 'hike',
    description: null,
    distanceKm: 10,
    originalFilename: `${id}.gpx`,
    storagePath: `${id}.gpx`,
    bounds: null,
    previewSegments: [],
    createdAt: T(1),
    updatedAt: T(20),
    deletedAt: null,
    ...extra,
  };
}

/** Хранилище в памяти: записи, байты, meta — и счётчики вызовов. */
function fakeRepo(records: SyncRecord[], gpx: Record<string, ArrayBuffer> = {}) {
  const state = {
    records: [...records],
    gpx: { ...gpx },
    meta: {} as Record<string, unknown>,
    replaced: false,
  };
  const repo: SyncRepo = {
    listAllRecords: async () => state.records,
    replaceRecords: async (rs) => {
      state.records = [...rs];
      state.replaced = true;
    },
    getGpxBytes: async (id) => state.gpx[id] ?? null,
    putGpxBytes: async (id, bytes) => {
      state.gpx[id] = bytes;
    },
    getMeta: async (key) => (state.meta[key] ?? null) as string | null,
    setMeta: async (key, value) => {
      state.meta[key] = value;
    },
  };
  return { repo, state };
}

/** Реле в памяти: манифест + файлы tracks/, журнал всех вызовов. */
function fakeRelay(manifest: Manifest | null, files: Record<string, ArrayBuffer> = {}) {
  const calls: string[] = [];
  const relay: SyncRelay = {
    health: async () => ({ status: 'ok', time: T(1) }),
    listFiles: async () => {
      calls.push('listFiles');
      return Object.keys(files).map((name) => ({ name, size: 1, modified: T(1) }));
    },
    getFile: async (path) => {
      calls.push(`getFile ${path}`);
      if (path === 'manifest.json' && manifest) {
        return new TextEncoder().encode(JSON.stringify(manifest)).buffer;
      }
      const name = path.replace('tracks/', '');
      if (files[name]) return files[name];
      throw new SyncError('missing', 'Файл не найден на Диске.');
    },
    putFile: async (path, bytes) => {
      calls.push(`putFile ${path}`);
      const name = path.replace('tracks/', '');
      files[name] = bytes;
    },
    deleteFile: async (path) => {
      calls.push(`deleteFile ${path}`);
      delete files[path.replace('tracks/', '')];
    },
  };
  return { relay, calls, files };
}

test('пустое облако — всё выложено, метка записана с обеих сторон', async () => {
  const { repo, state } = fakeRepo([district('d1'), track('t1')], {
    t1: new TextEncoder().encode('bytes').buffer, // ключи gpx — id трека
  });
  const { relay, calls, files } = fakeRelay(null);
  const report = await synchronize(repo, relay);
  expect(report.pushed).toBe(2); // записи уехали в манифест
  expect(report.filesUp).toBe(1);
  expect(calls).toContain('putFile manifest.json');
  expect(files['t1.gpx']).toBeTruthy();
  const saved = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as Manifest;
  expect(saved.records.map((r) => r.id).sort()).toEqual(['d1', 't1']);
  expect(saved.syncedAt).toBe(report.syncedAt);
  expect(state.meta['lastSyncAt']).toBe(report.syncedAt);
});

test('облачный трек забран вместе с байтами', async () => {
  const { repo, state } = fakeRepo([district('d1')]);
  const cloudManifest = buildManifest(
    [district('d1'), track('t9')],
    T(10),
  );
  const { relay } = fakeRelay(cloudManifest, { 't9.gpx': new TextEncoder().encode('новый').buffer });
  const report = await synchronize(repo, relay);
  expect(report.taken).toBe(1);
  expect(report.filesDown).toBe(1);
  expect(new TextDecoder().decode(state.gpx['t9'])).toBe('новый');
  expect(state.replaced).toBe(true);
});

test('конфликт дат — победило свежее, конфликт в отчёте', async () => {
  const local = [track('t1', { name: 'локальное', updatedAt: T(20) })];
  const { repo, state } = fakeRepo(local);
  const cloud = buildManifest([track('t1', { name: 'облачное', updatedAt: T(25) })], T(10));
  const { relay } = fakeRelay(cloud);
  const report = await synchronize(repo, relay);
  expect(report.conflicts).toBe(1);
  const applied = state.records.find((r) => r.id === 't1');
  expect(applied?.name).toBe('облачное');
});

test('надгробие трека — файл удалён с Диска', async () => {
  const local = [district('d1'), track('t1', { deletedAt: T(30), updatedAt: T(30) })];
  const { repo } = fakeRepo(local);
  const { relay, calls, files } = fakeRelay(buildManifest([], T(1)), { 't1.gpx': new TextEncoder().encode('x').buffer });
  await synchronize(repo, relay);
  expect(calls).toContain('deleteFile tracks/t1.gpx');
  expect(files['t1.gpx']).toBeUndefined();
});

test('битый манифест — SyncError, локальное не тронуто', async () => {
  const { repo, state } = fakeRepo([district('d1')]);
  const bad = {
    getFile: async () => new TextEncoder().encode('{не json').buffer,
    listFiles: async () => [],
    putFile: async () => {},
    deleteFile: async () => {},
    health: async () => ({ status: 'ok', time: T(1) }),
  } as unknown as SyncRelay;
  await expect(synchronize(repo, bad)).rejects.toBeInstanceOf(SyncError);
  expect(state.replaced).toBe(false);
});

test('401 на manifest — SyncError token, ничего не применено', async () => {
  const { repo, state } = fakeRepo([district('d1')]);
  const dead = {
    getFile: async () => {
      throw new SyncError('token', 'Токен протух.');
    },
    listFiles: async () => {
      throw new SyncError('token', 'Токен протух.');
    },
    putFile: async () => {
      throw new SyncError('token', 'Токен протух.');
    },
    deleteFile: async () => {},
    health: async () => ({ status: 'ok', time: T(1) }),
  } as unknown as SyncRelay;
  const err: unknown = await synchronize(repo, dead).catch((e) => e);
  expect((err as SyncError).failure).toBe('token');
  expect(state.replaced).toBe(false);
});

test('fast-path: метки равны и локальных правок нет — только чтение манифеста', async () => {
  const syncedAt = T(40);
  const records = [district('d1', { updatedAt: T(30) })];
  const { repo, state } = fakeRepo(records);
  await repo.setMeta('lastSyncAt', syncedAt);
  const { relay, calls } = fakeRelay(buildManifest(records, syncedAt));
  const report = await synchronize(repo, relay);
  expect(report.taken).toBe(0);
  expect(report.filesUp).toBe(0);
  expect(calls.filter((c) => c.startsWith('putFile'))).toHaveLength(0);
  expect(state.meta['lastSyncAt']).toBe(syncedAt);
});

test('локальная правка после lastSyncAt ломает fast-path', async () => {
  const syncedAt = T(40);
  const { repo } = fakeRepo([district('d1', { updatedAt: T(45) })]); // правка новее метки
  await repo.setMeta('lastSyncAt', syncedAt);
  const { relay, calls } = fakeRelay(buildManifest([district('d1', { updatedAt: T(30) })], syncedAt));
  await synchronize(repo, relay);
  expect(calls).toContain('putFile manifest.json');
});

test('summary по-русски содержит «синхронизировано»', async () => {
  const { repo } = fakeRepo([district('d1'), track('t1')]);
  const { relay } = fakeRelay(null, {});
  const report = await synchronize(repo, relay);
  expect(report.summary()).toContain('синхронизировано');
  expect(report.summary()).toContain('забрано');
});
