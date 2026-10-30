import { buildManifest, parseManifest, type Manifest, type SyncRecord } from './manifest';
import { mergeRecords } from './merge';

const T = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`;

function district(id: string, name: string, extra: Partial<SyncRecord> = {}): SyncRecord {
  return { id, kind: 'district', name, isPrimary: false, updatedAt: T(20), deletedAt: null, ...extra };
}

function track(id: string, districtId: string, extra: Partial<SyncRecord> = {}): SyncRecord {
  return {
    id,
    kind: 'track',
    districtId,
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

test('новая локальная запись остаётся (pushed)', () => {
  const local = [track('t1', 'd1')];
  const { merged, report } = mergeRecords(local, []);
  expect(merged.map((r) => r.id)).toEqual(['t1']);
  expect(report.pushed).toBe(1);
  expect(report.taken).toBe(0);
});

test('новая облачная забирается (taken)', () => {
  const cloud = [track('t1', 'd1')];
  const { merged, report } = mergeRecords([], cloud);
  expect(merged.map((r) => r.id)).toEqual(['t1']);
  expect(report.taken).toBe(1);
});

test('облачная новее — побеждает облако', () => {
  const local = [track('t1', 'd1', { name: 'локальное', updatedAt: T(20) })];
  const cloud = [track('t1', 'd1', { name: 'облачное', updatedAt: T(25) })];
  const { merged } = mergeRecords(local, cloud);
  expect(merged[0].name).toBe('облачное');
});

test('локальная новее — побеждает локальная', () => {
  const local = [track('t1', 'd1', { name: 'локальное', updatedAt: T(28) })];
  const cloud = [track('t1', 'd1', { name: 'облачное', updatedAt: T(25) })];
  const { merged } = mergeRecords(local, cloud);
  expect(merged[0].name).toBe('локальное');
});

test('правка новее удаления — запись воскресает', () => {
  const local = [track('t1', 'd1', { deletedAt: T(20), updatedAt: T(20) })];
  const cloud = [track('t1', 'd1', { name: 'отредактировали позже', updatedAt: T(25) })];
  const { merged } = mergeRecords(local, cloud);
  expect(merged[0].deletedAt).toBeNull();
  expect(merged[0].name).toBe('отредактировали позже');
});

test('удаление новее правки — остаётся удалённой', () => {
  const local = [track('t1', 'd1', { name: 'правка', updatedAt: T(25) })];
  const cloud = [track('t1', 'd1', { deletedAt: T(28), updatedAt: T(28) })];
  const { merged } = mergeRecords(local, cloud);
  expect(merged[0].deletedAt).not.toBeNull();
});

test('тай-брейк по каноническому JSON: симметричен и детерминирован', () => {
  const a = track('t1', 'd1', { name: 'альфа', updatedAt: T(20) });
  const b = track('t1', 'd1', { name: 'бета', updatedAt: T(20) });
  const ab = mergeRecords([a], [b]).merged[0];
  const ba = mergeRecords([b], [a]).merged[0];
  expect(ab.name).toBe(ba.name); // одна и та же версия с обеих сторон
  expect(ab.name).toBe('бета'); // канонический JSON «бета» лексикографически больше
});

test('сирота: живой трек возвращает удалённый район', () => {
  const local = [
    district('d1', 'Хибины', { deletedAt: T(20), updatedAt: T(20) }),
    track('t1', 'd1', { updatedAt: T(25) }),
  ];
  const { merged } = mergeRecords(local, []);
  const revived = merged.find((r) => r.id === 'd1')!;
  expect(revived.deletedAt).toBeNull();
});

test('основной район ровно один — самый свежий из isPrimary', () => {
  const local = [district('d1', 'А', { isPrimary: true, updatedAt: T(20) })];
  const cloud = [district('d2', 'Б', { isPrimary: true, updatedAt: T(25) })];
  const { merged } = mergeRecords(local, cloud);
  const primaries = merged.filter((r) => r.kind === 'district' && (r.isPrimary as boolean));
  expect(primaries).toHaveLength(1);
  expect(primaries[0].id).toBe('d2'); // свежее побеждает
});

test('parseManifest читает свою запись', () => {
  const manifest = buildManifest([track('t1', 'd1')], T(30));
  const parsed = parseManifest(JSON.stringify(manifest));
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.manifest.syncedAt).toBe(T(30));
    expect(parsed.manifest.records).toHaveLength(1);
  }
});

test('parseManifest отвергает чужую версию и не-JSON', () => {
  const wrong = parseManifest(JSON.stringify({ version: 99, syncedAt: T(1), records: [] }));
  expect(wrong.ok).toBe(false);
  if (!wrong.ok) expect(wrong.reason).toContain('верси');
  const broken = parseManifest('{не json');
  expect(broken.ok).toBe(false);
});

test('buildManifest ставит версию формата', () => {
  const manifest: Manifest = buildManifest([], T(1));
  expect(manifest.version).toBe(1);
});
