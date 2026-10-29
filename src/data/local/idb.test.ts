import { deleteDb, idbDelete, idbGet, idbGetAll, idbPut, openDb } from './idb';

/** Своя тестовая база на файл — fake-indexeddb общий на процесс. */
async function freshDb(name: string) {
  await deleteDb(name);
  return openDb(name, 1, (db) => db.createObjectStore('records', { keyPath: 'id' }));
}

test('idb: положил — достал тот же объект', async () => {
  const db = await freshDb('idb-roundtrip');
  await idbPut(db, 'records', { id: 'a1', name: 'Рядом' });
  expect(await idbGet<{ id: string; name: string }>(db, 'records', 'a1')).toEqual({
    id: 'a1',
    name: 'Рядом',
  });
});

test('idb: несуществующий ключ → undefined', async () => {
  const db = await freshDb('idb-missing');
  expect(await idbGet(db, 'records', 'nope')).toBeUndefined();
});

test('idb: getAll возвращает все записи', async () => {
  const db = await freshDb('idb-getall');
  await idbPut(db, 'records', { id: 'a', n: 1 });
  await idbPut(db, 'records', { id: 'b', n: 2 });
  const all = await idbGetAll<{ id: string; n: number }>(db, 'records');
  expect(all).toHaveLength(2);
  expect(all.map((r) => r.id).sort()).toEqual(['a', 'b']);
});

test('idb: delete убирает запись', async () => {
  const db = await freshDb('idb-delete');
  await idbPut(db, 'records', { id: 'a', n: 1 });
  await idbDelete(db, 'records', 'a');
  expect(await idbGet(db, 'records', 'a')).toBeUndefined();
  expect(await idbGetAll(db, 'records')).toEqual([]);
});
