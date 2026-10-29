import { deleteDb } from './idb';
import { LocalTrackRepository } from './repository';

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

test('битый GPX — человеческая ошибка', async () => {
  const { repo } = await freshRepo();
  const home = (await repo.listDistricts())[0];
  await expect(
    repo.addTrack(new File(['совсем не xml'], 'x.gpx', { type: 'application/gpx+xml' }), {
      districtId: home.id,
      category: 'hike',
      name: 'Битый',
    }),
  ).rejects.toThrow('Не удалось прочитать файл');
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
