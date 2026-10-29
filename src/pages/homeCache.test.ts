import type { District, Track } from '../data/repository';
import {
  readCachedDistricts,
  writeCachedDistricts,
  readCachedTracks,
  writeCachedTracks,
} from './homeCache';

const d = (id: string, name: string, isPrimary = false): District => ({ id, name, isPrimary });

const track = (id: string, districtId: string): Track => ({
  id,
  districtId,
  category: 'hike',
  name: 'Кольцо Падуна',
  description: null,
  distanceKm: 12.5,
  originalFilename: 'k.gpx',
  storagePath: 'x.gpx',
  bounds: null,
  previewSegments: [],
  createdAt: '2026-10-29',
});

test('районы: write → read туда-обратно, без кэша null', () => {
  expect(readCachedDistricts()).toBeNull();
  writeCachedDistricts([d('a', 'Рядом', true), d('b', 'Далеко')]);
  expect(readCachedDistricts()).toEqual([d('a', 'Рядом', true), d('b', 'Далеко')]);
});

test('районы: битый JSON и мусор читаются как отсутствие кэша', () => {
  localStorage.setItem('roamark.cache.districts', '{oops');
  expect(readCachedDistricts()).toBeNull();
  localStorage.setItem('roamark.cache.districts', JSON.stringify([{ nope: 1 }]));
  expect(readCachedDistricts()).toBeNull();
});

test('треки: кэш по районам; нет района — null, пустой список — []', () => {
  expect(readCachedTracks('a')).toBeNull();
  writeCachedTracks('a', [track('t1', 'a')]);
  expect(readCachedTracks('a')).toEqual([track('t1', 'a')]);
  writeCachedTracks('b', []);
  expect(readCachedTracks('b')).toEqual([]);
});

test('треки: запись одного района не затирает другой', () => {
  writeCachedTracks('a', [track('t1', 'a')]);
  writeCachedTracks('b', []);
  expect(readCachedTracks('a')).toEqual([track('t1', 'a')]);
  expect(readCachedTracks('b')).toEqual([]);
});
