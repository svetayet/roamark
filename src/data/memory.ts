import type { TrackMetaInput } from './types';
import {
  PREVIEW_MAX_POINTS,
  RepositoryError,
  type District,
  type Track,
  type TrackRepository,
} from './repository';
import { parseGpxSegments } from '../logic/gpx';
import { segmentsBounds, segmentsDistanceKm } from '../logic/geo';
import { buildPreview } from './preview';

/** Ошибка парсера — тоже RepositoryError (паритет с локальным репозиторием). */
function parseOrRepositoryError(gpxText: string) {
  try {
    return parseGpxSegments(gpxText);
  } catch (e) {
    throw new RepositoryError(e instanceof Error ? e.message : 'Не удалось прочитать файл.');
  }
}

/**
 * Реализация TrackRepository в памяти: тесты.
 * На пустой карте сразу создаёт основной район «Рядом» —
 * как LocalTrackRepository на первом запуске.
 */
export class InMemoryTrackRepository implements TrackRepository {
  private districts = new Map<string, District>();
  private tracks = new Map<string, Track & { gpxText: string }>();
  private meta = new Map<string, unknown>();

  constructor() {
    this.ensureBootstrap();
  }

  async listDistricts(): Promise<District[]> {
    return [...this.districts.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  async createDistrict(name: string): Promise<District> {
    const district: District = {
      id: crypto.randomUUID(),
      name: name.trim(),
      isPrimary: this.districts.size === 0,
    };
    this.districts.set(district.id, district);
    return district;
  }

  async renameDistrict(id: string, name: string): Promise<void> {
    const district = this.getDistrict(id);
    this.districts.set(id, { ...district, name: name.trim() });
  }

  async setPrimaryDistrict(id: string): Promise<void> {
    this.getDistrict(id);
    for (const [key, d] of this.districts) {
      this.districts.set(key, { ...d, isPrimary: key === id });
    }
  }

  async deleteDistrict(id: string): Promise<void> {
    this.getDistrict(id);
    const hasTracks = [...this.tracks.values()].some((t) => t.districtId === id);
    if (hasTracks) {
      throw new RepositoryError(
        'В районе есть треки — сначала перенесите их в другой район.',
      );
    }
    this.districts.delete(id);
  }

  async listTracks(districtId: string): Promise<Track[]> {
    return [...this.tracks.values()]
      .filter((t) => t.districtId === districtId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTrack(id: string): Promise<Track> {
    return this.getTrackInternal(id);
  }

  async addTrack(file: File, meta: TrackMetaInput): Promise<Track> {
    this.getDistrict(meta.districtId);
    const gpxText = await file.text();
    const segments = parseOrRepositoryError(gpxText);
    const id = crypto.randomUUID();
    const entry: Track & { gpxText: string } = {
      id,
      districtId: meta.districtId,
      category: meta.category,
      name: meta.name.trim(),
      description: meta.description?.trim() || null,
      distanceKm: segmentsDistanceKm(segments),
      originalFilename: file.name,
      storagePath: `${id}.gpx`,
      bounds: segmentsBounds(segments),
      previewSegments: buildPreview(segments, PREVIEW_MAX_POINTS),
      createdAt: new Date().toISOString(),
      gpxText,
    };
    this.tracks.set(id, entry);
    return entry;
  }

  async updateTrackMeta(id: string, meta: TrackMetaInput): Promise<void> {
    this.getDistrict(meta.districtId);
    const track = this.getTrackInternal(id);
    this.tracks.set(id, {
      ...track,
      districtId: meta.districtId,
      category: meta.category,
      name: meta.name.trim(),
      description: meta.description?.trim() || null,
    });
  }

  async deleteTrack(id: string): Promise<void> {
    if (!this.tracks.delete(id)) {
      throw new RepositoryError('Трек не найден.');
    }
  }

  async getGpxText(id: string): Promise<string> {
    return this.getTrackInternal(id).gpxText;
  }

  async getDownloadUrl(id: string): Promise<string> {
    const text = this.getTrackInternal(id).gpxText;
    return `data:application/gpx+xml;charset=utf-8,${encodeURIComponent(text)}`;
  }

  /** Метки синхронизации (lastSyncAt) — паритет с LocalTrackRepository. */
  async getMeta<T>(key: string): Promise<T | null> {
    return (this.meta.get(key) ?? null) as T | null;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    this.meta.set(key, value);
  }

  private ensureBootstrap(): void {
    if (this.districts.size === 0) {
      const id = crypto.randomUUID();
      this.districts.set(id, { id, name: 'Рядом', isPrimary: true });
    }
  }

  private getDistrict(id: string): District {
    const district = this.districts.get(id);
    if (!district) throw new RepositoryError('Район не найден.');
    return district;
  }

  private getTrackInternal(id: string): Track & { gpxText: string } {
    const track = this.tracks.get(id);
    if (!track) throw new RepositoryError('Трек не найден.');
    return track;
  }
}
