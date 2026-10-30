import { deleteDb, idbPut, openDb } from './idb';
import { LocalTrackRepository } from './repository';
import { RepositoryError } from '../repository';

const GPX_RU = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1">
<trk><name>Кольцо Падуна</name><trkseg>
<trkpt lat="51.8" lon="104.9"></trkpt>
<trkpt lat="51.9" lon="104.8"></trkpt>
<trkpt lat="52.0" lon="105.0"></trkpt>
</trkseg></trk></gpx>`;

let dbSeq = 0;
/** Своя база на тест + готовый репозиторий. */
async function freshRepo() {
  const dbName = `local-repo-${(dbSeq += 1)}`;
  await deleteDb(dbName);
  return { dbName, repo: new LocalTrackRepository(dbName) };
}

function gpxFile(name = 'кольцо-падуна.gpx') {
  return new File([GPX_RU], name, { type: 'application/gpx+xml' });
}

test('первый запуск: создаётся основной район «Рядом»', async () => {
  const { repo } = await freshRepo();
  const districts = await repo.listDistricts();
  expect(districts).toHaveLength(1);
  expect(districts[0].name).toBe('Рядом');
  expect(districts[0].isPrimary).toBe(true);
});

test('районы: создание, переименование, смена основного', async () => {
  const { repo } = await freshRepo();
  const far = await repo.createDistrict('Далеко');
  expect((await repo.listDistricts()).map((d) => d.name).sort()).toEqual(['Далеко', 'Рядом']);
  await repo.renameDistrict(far.id, 'Ещё дальше');
  expect((await repo.listDistricts()).some((d) => d.name === 'Ещё дальше')).toBe(true);
  await repo.setPrimaryDistrict(far.id);
  const after = await repo.listDistricts();
  expect(after.find((d) => d.id === far.id)?.isPrimary).toBe(true);
  expect(after.find((d) => d.name === 'Рядом')?.isPrimary).toBe(false);
});

test('удаление района с треками — человеческая ошибка', async () => {
  const { repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Кольцо Падуна',
  });
  await expect(repo.deleteDistrict(home.id)).rejects.toThrow('В районе есть треки');
});

test('addTrack считает километраж и сохраняет мета', async () => {
  const { repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Кольцо Падуна',
    description: 'любимая прогулка',
  });
  expect(track.distanceKm).toBeGreaterThan(0);
  expect(track.originalFilename).toBe('кольцо-падуна.gpx');
  expect(track.description).toBe('любимая прогулка');
  expect(track.bounds).not.toBeNull();
  expect(track.previewSegments.length).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(track.createdAt))).toBe(false);
  expect((await repo.listTracks(home.id)).map((t) => t.id)).toEqual([track.id]);
});

test('байты: скачивание байт-в-байт, включая кириллицу', async () => {
  // jsdom без createObjectURL — ставим заглушку до шпиона.
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:mock',
    });
  }
  const { repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Кольцо Падуна',
  });
  const spy = vi.spyOn(URL, 'createObjectURL');
  await repo.getDownloadUrl(track.id);
  expect(spy).toHaveBeenCalledTimes(1);
  const blob = spy.mock.calls[0][0] as Blob;
  const stored = new Uint8Array(await blob.arrayBuffer());
  const original = new Uint8Array(await gpxFile().arrayBuffer());
  expect(stored).toEqual(original);
});

test('переживает переоткрытие: второй репозиторий видит трек', async () => {
  const { dbName, repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Кольцо Падуна',
  });
  const reopened = new LocalTrackRepository(dbName);
  const tracks = await reopened.listTracks(home.id);
  expect(tracks.map((t) => t.id)).toEqual([track.id]);
  expect(await reopened.getGpxText(track.id)).toBe(GPX_RU);
});

test('битый GPX — RepositoryError с человеческим сообщением', async () => {
  const { repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  const err: unknown = await repo
    .addTrack(new File(['совсем не xml'], 'x.gpx', { type: 'application/gpx+xml' }), {
      districtId: home.id,
      category: 'hike',
      name: 'Битый',
    })
    .catch((e) => e);
  // Тип важен не меньше текста: внешние обработчики показывают сообщение
  // только у RepositoryError.
  expect(err).toBeInstanceOf(RepositoryError);
  expect(err instanceof Error && err.message).toContain('Не удалось прочитать файл');
});

test('updateTrackMeta меняет мета, deleteTrack убирает трек', async () => {
  const { repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Старое имя',
  });
  await repo.updateTrackMeta(track.id, {
    districtId: home.id,
    category: 'bike',
    name: 'Новое имя',
    description: 'описание',
  });
  const updated = await repo.getTrack(track.id);
  expect(updated.name).toBe('Новое имя');
  expect(updated.category).toBe('bike');
  await repo.deleteTrack(track.id);
  await expect(repo.getTrack(track.id)).rejects.toThrow('Трек не найден');
  await expect(repo.deleteTrack(track.id)).rejects.toThrow('Трек не найден');
});

test('удалённый трек исчезает из списков, но живёт в listAllRecords как надгробие', async () => {
  const { repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Кольцо Падуна',
  });
  await repo.deleteTrack(track.id);
  expect(await repo.listTracks(home.id)).toHaveLength(0);
  const graves = (await repo.listAllRecords()).filter((r) => r.id === track.id);
  expect(graves).toHaveLength(1);
  expect(graves[0].deletedAt).not.toBeNull();
  // байты надгробия стёрты сразу
  expect(await repo.getGpxBytes(track.id)).toBeNull();
});

test('updateTrackMeta обновляет updatedAt', async () => {
  const { repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Имя',
  });
  const before = (await repo.listAllRecords()).find((r) => r.id === track.id)!.updatedAt;
  await new Promise((r) => setTimeout(r, 5)); // даты с разницей, не одна и та же миллисекунда
  await repo.updateTrackMeta(track.id, { districtId: home.id, category: 'hike', name: 'Имя2' });
  const after = (await repo.listAllRecords()).find((r) => r.id === track.id)!.updatedAt;
  expect(Date.parse(after)).toBeGreaterThan(Date.parse(before));
});

test('listAllRecords нормализует запись без updatedAt (берёт createdAt)', async () => {
  const { dbName, repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Старая база',
  });
  // База этапа 1: записи без updatedAt. Подкладываем такую же руками.
  const db = await openDb(dbName, 2, () => {});
  await idbPut(db, 'records', {
    id: track.id,
    kind: 'track',
    createdAt: track.createdAt,
  } as never);
  db.close();
  const record = (await repo.listAllRecords()).find((r) => r.id === track.id)!;
  expect(record.updatedAt).toBe(track.createdAt);
});

test('база этапа 1 (версии 1, без meta-стора) переезжает на v2 без потерь', async () => {
  const dbName = `local-repo-${(dbSeq += 1)}`;
  await deleteDb(dbName);
  // Руками делаем базу этапа 1: только records и gpx, записи без updatedAt.
  const v1 = await openDb(dbName, 1, (db) => {
    db.createObjectStore('records', { keyPath: 'id' });
    db.createObjectStore('gpx', { keyPath: 'id' });
  });
  await idbPut(v1, 'records', {
    id: 'd-old',
    kind: 'district',
    name: 'Хибины',
    isPrimary: true,
  } as never);
  v1.close();

  const repo = new LocalTrackRepository(dbName);
  const districts = await repo.listDistricts();
  expect(districts.map((d) => d.name)).toEqual(['Хибины']); // живой район уцелел
  expect(districts).toHaveLength(1); // «Рядом» не добавился — живой уже есть
  expect((await repo.listAllRecords()).map((r) => r.id)).toContain('d-old');
  expect(await repo.getMeta('lastSyncAt')).toBeNull(); // meta-стор появился
  await repo.setMeta('lastSyncAt', '2026-10-30T10:00:00Z');
  expect(await repo.getMeta('lastSyncAt')).toBe('2026-10-30T10:00:00Z');
});

test('meta-стор читает и пишет', async () => {
  const { repo } = await freshRepo();
  expect(await repo.getMeta('lastSyncAt')).toBeNull();
  await repo.setMeta('lastSyncAt', '2026-10-30T10:00:00Z');
  expect(await repo.getMeta('lastSyncAt')).toBe('2026-10-30T10:00:00Z');
});

test('replaceRecords переписывает набор записей целиком', async () => {
  const { repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Локальный',
  });
  const cloud = [
    { id: 'd1', kind: 'district', name: 'Из облака', isPrimary: true, updatedAt: '2026-10-30T09:00:00Z', deletedAt: null },
    { id: 't1', kind: 'track', districtId: 'd1', name: 'Трек из облака', updatedAt: '2026-10-30T09:00:00Z', deletedAt: null },
  ];
  await repo.replaceRecords(cloud as never);
  const all = await repo.listAllRecords();
  expect(all.map((r) => r.id).sort()).toEqual(['d1', 't1']);
  expect((await repo.listDistricts()).map((d) => d.name)).toEqual(['Из облака']);
});

test('надгробие пустого района', async () => {
  const { repo } = await freshRepo();
  const far = await repo.createDistrict('Далеко');
  await repo.deleteDistrict(far.id);
  expect((await repo.listDistricts()).map((d) => d.id)).not.toContain(far.id);
  const grave = (await repo.listAllRecords()).find((r) => r.id === far.id);
  expect(grave?.deletedAt).not.toBeNull();
});

test('putGpxBytes/getGpxBytes — байты туда и обратно', async () => {
  const { repo } = await freshRepo();
  const bytes = new TextEncoder().encode('лес 🌲').buffer;
  await repo.putGpxBytes('x1', bytes);
  const back = await repo.getGpxBytes('x1');
  expect(new TextDecoder().decode(back!)).toBe('лес 🌲');
});
