import type { Bounds, Category, LatLng, TrackMetaInput } from './types';

export { type Category, type LatLng, type Bounds, type TrackMetaInput } from './types';

/** Ошибка хранилища с сообщением для пользователя. */
export class RepositoryError extends Error {}

export interface Track {
  id: string;
  districtId: string;
  category: Category;
  name: string;
  description: string | null;
  distanceKm: number;
  originalFilename: string;
  storagePath: string;
  bounds: Bounds | null;
  /** Упрощённая полилиния для мини-карт (суммарно ≤ PREVIEW_MAX_POINTS). */
  previewSegments: LatLng[][];
  createdAt: string;
}

export interface District {
  id: string;
  name: string;
  isPrimary: boolean;
}

export const PREVIEW_MAX_POINTS = 400;

/**
 * Единственный способ приложения работать с данными.
 * Реализации: LocalTrackRepository (прод, IndexedDB — src/data/local/),
 * InMemoryTrackRepository (тесты).
 */
export interface TrackRepository {
  listDistricts(): Promise<District[]>;
  createDistrict(name: string): Promise<District>;
  renameDistrict(id: string, name: string): Promise<void>;
  /** Ровно один район основной. */
  setPrimaryDistrict(id: string): Promise<void>;
  /** RepositoryError, если в районе есть треки. */
  deleteDistrict(id: string): Promise<void>;

  listTracks(districtId: string): Promise<Track[]>;
  getTrack(id: string): Promise<Track>;
  addTrack(file: File, meta: TrackMetaInput): Promise<Track>;
  updateTrackMeta(id: string, meta: TrackMetaInput): Promise<void>;
  deleteTrack(id: string): Promise<void>;

  /** Полное содержимое исходного .gpx (для большой карты). */
  getGpxText(id: string): Promise<string>;
  /** Ссылка на оригинальный файл для скачивания. */
  getDownloadUrl(id: string): Promise<string>;
}
