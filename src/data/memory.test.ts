import { InMemoryTrackRepository } from './memory';
import { PREVIEW_MAX_POINTS, RepositoryError } from './repository';

const GPX_3_POINTS = `<?xml version="1.0"?><gpx version="1.1">
<trk><trkseg>
<trkpt lat="51.8" lon="104.9"></trkpt>
<trkpt lat="51.9" lon="104.8"></trkpt>
<trkpt lat="52.0" lon="105.0"></trkpt>
</trkseg></trk></gpx>`;

const gpxFile = (name = 'Кольцо Падуна.gpx') =>
  new File([GPX_3_POINTS], name, { type: 'application/gpx+xml' });

test('новый репозиторий сразу с основным районом «Рядом»', async () => {
  const repo = new InMemoryTrackRepository();
  const districts = await repo.listDistricts();
  expect(districts).toHaveLength(1);
  expect(districts[0].name).toBe('Рядом');
  expect(districts[0].isPrimary).toBe(true);
});

test('setPrimaryDistrict оставляет ровно один основной при любой последовательности', async () => {
  const repo = new InMemoryTrackRepository();
  const d1 = await repo.createDistrict('Рядом');
  const d2 = await repo.createDistrict('Хакасия');
  await repo.setPrimaryDistrict(d2.id);
  let list = await repo.listDistricts();
  expect(list.find((d) => d.id === d2.id)?.isPrimary).toBe(true);
  expect(list.find((d) => d.id === d1.id)?.isPrimary).toBe(false);
  expect(list.filter((d) => d.isPrimary)).toHaveLength(1);
  await repo.setPrimaryDistrict(d1.id);
  list = await repo.listDistricts();
  expect(list.filter((d) => d.isPrimary)).toHaveLength(1);
  expect(list.find((d) => d.id === d1.id)?.isPrimary).toBe(true);
});

test('deleteDistrict пустого ок; с треками — RepositoryError', async () => {
  const repo = new InMemoryTrackRepository();
  const home = (await repo.listDistricts()).find(() => true)!;
  const empty = await repo.createDistrict('Пустой');
  await expect(repo.deleteDistrict(empty.id)).resolves.toBeUndefined();
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Кольцо',
  });
  await expect(repo.deleteDistrict(home.id)).rejects.toBeInstanceOf(RepositoryError);
  await repo.deleteTrack(track.id);
  await expect(repo.deleteDistrict(home.id)).resolves.toBeUndefined();
});

test('addTrack парсит файл: километры, превью ≤400, uuid-путь, имя файла; новые сверху', async () => {
  const repo = new InMemoryTrackRepository();
  const home = (await repo.listDistricts()).find(() => true)!;
  const first = await repo.addTrack(gpxFile('первый.gpx'), {
    districtId: home.id,
    category: 'hike',
    name: 'Первый',
  });
  const second = await repo.addTrack(gpxFile('второй 😎.gpx'), {
    districtId: home.id,
    category: 'bike',
    name: 'Второй',
  });
  expect(first.distanceKm).toBeGreaterThan(10); // три точки по ~0.1-0.2 градуса
  expect(
    second.previewSegments.reduce((n, s) => n + s.length, 0),
  ).toBeLessThanOrEqual(PREVIEW_MAX_POINTS);
  expect(second.originalFilename).toBe('второй 😎.gpx');
  expect(second.storagePath).toMatch(/^[0-9a-f-]{36}\.gpx$/);
  const list = await repo.listTracks(home.id);
  expect(list[0].id).toBe(second.id);
  expect(list[1].id).toBe(first.id);
});

test('updateTrackMeta меняет только метаданные', async () => {
  const repo = new InMemoryTrackRepository();
  const home = (await repo.listDistricts()).find(() => true)!;
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Было',
  });
  await repo.updateTrackMeta(track.id, {
    districtId: home.id,
    category: 'run',
    name: 'Стало',
    description: 'пробежка',
  });
  const updated = await repo.getTrack(track.id);
  expect(updated.name).toBe('Стало');
  expect(updated.category).toBe('run');
  expect(updated.distanceKm).toBe(track.distanceKm);
  expect(updated.storagePath).toBe(track.storagePath);
});

test('getGpxText байт-в-байт; getDownloadUrl отдаёт исходный текст; getTrack несуществующего — ошибка', async () => {
  const repo = new InMemoryTrackRepository();
  const home = (await repo.listDistricts()).find(() => true)!;
  const track = await repo.addTrack(gpxFile('имя с пробелами.gpx'), {
    districtId: home.id,
    category: 'ski',
    name: 'Лыжня',
  });
  expect(await repo.getGpxText(track.id)).toBe(GPX_3_POINTS);
  const url = await repo.getDownloadUrl(track.id);
  expect(url.startsWith('data:application/gpx+xml')).toBe(true);
  const decoded = decodeURIComponent(url.split(',').slice(1).join(','));
  expect(decoded).toBe(GPX_3_POINTS);
  await expect(repo.getTrack('нет-такого')).rejects.toBeInstanceOf(RepositoryError);
});

test('битый GPX — RepositoryError с человеческим сообщением (паритет с локальным)', async () => {
  const repo = new InMemoryTrackRepository();
  const home = (await repo.listDistricts())[0];
  const err: unknown = await repo
    .addTrack(new File(['совсем не xml'], 'x.gpx', { type: 'application/gpx+xml' }), {
      districtId: home.id,
      category: 'hike',
      name: 'Битый',
    })
    .catch((e) => e);
  expect(err).toBeInstanceOf(RepositoryError);
  expect(err instanceof Error && err.message).toContain('Не удалось прочитать файл');
});
