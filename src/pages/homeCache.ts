import type { District, Track } from '../data/repository';

/**
 * Кэш главной на localStorage: экран рисуется до ответа сервера
 * (stale-while-revalidate), обновление приезжает фоном и поправляет список.
 * Кэш некритичен — любое отсутствие/битность читается как «нет кэша».
 */

const DISTRICTS_KEY = 'roamark.cache.districts';
const TRACKS_KEY = 'roamark.cache.tracks';

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Приватный режим или переполнение — кэш не критичен.
  }
}

const isDistrict = (x: unknown): x is District =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as District).id === 'string' &&
  typeof (x as District).name === 'string';

const isTrack = (x: unknown): x is Track =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as Track).id === 'string' &&
  typeof (x as Track).districtId === 'string' &&
  typeof (x as Track).name === 'string';

export function readCachedDistricts(): District[] | null {
  const v = readJson(DISTRICTS_KEY);
  if (!Array.isArray(v) || !v.every(isDistrict)) return null;
  return v;
}

export function writeCachedDistricts(list: District[]): void {
  writeJson(DISTRICTS_KEY, list);
}

export function readCachedTracks(districtId: string): Track[] | null {
  const v = readJson(TRACKS_KEY);
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const list = (v as Record<string, unknown>)[districtId];
  if (!Array.isArray(list) || !list.every(isTrack)) return null;
  return list;
}

export function writeCachedTracks(districtId: string, list: Track[]): void {
  const v = readJson(TRACKS_KEY);
  const map =
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  map[districtId] = list;
  writeJson(TRACKS_KEY, map);
}
