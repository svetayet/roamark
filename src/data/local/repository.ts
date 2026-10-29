import type { TrackMetaInput } from '../types';
import {
  PREVIEW_MAX_POINTS,
  RepositoryError,
  type District,
  type Track,
  type TrackRepository,
} from '../repository';
import { parseGpxSegments } from '../../logic/gpx';
import { segmentsBounds, segmentsDistanceKm } from '../../logic/geo';
import { buildPreview } from '../preview';
import { idbDelete, idbGet, idbGetAll, idbPut, openDb } from './idb';

/**
 * Локальная реализация TrackRepository: все данные и GPX-файлы живут
 * в браузере (IndexedDB), чтение мгновенное и работает без сети.
 * Первый запуск на пустой базе создаёт основной район «Рядом» —
 * того же требует InMemoryTrackRepository в тестах.
 */

type DistrictRecord = { id: string; kind: 'district' } & District;
type TrackRecord = { id: string; kind: 'track' } & Track;
/** Байты GPX хранятся как ArrayBuffer — Blob собирается при чтении. */
type GpxRecord = { id: string; bytes: ArrayBuffer };

export class LocalTrackRepository implements TrackRepository {
  private readonly db: Promise<IDBDatabase>;

  constructor(dbName: string = 'roamark') {
    this.db = openDb(dbName, 1, (db) => {
      db.createObjectStore('records', { keyPath: 'id' });
      db.createObjectStore('gpx', { keyPath: 'id' });
    }).then(async (db) => {
      await this.ensureDefaultDistrict(db);
      return db;
    });
  }

  async listDistricts(): Promise<District[]> {
    const db = await this.db;
    const records = await idbGetAll<DistrictRecord>(db, 'records');
    return records
      .filter((r) => r.kind === 'district')
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  async createDistrict(name: string): Promise<District> {
    const db = await this.db;
    const districts = await this.districts(db);
    const record: DistrictRecord = {
      id: crypto.randomUUID(),
      kind: 'district',
      name: name.trim(),
      isPrimary: districts.length === 0,
    };
    await idbPut(db, 'records', record);
    return { id: record.id, name: record.name, isPrimary: record.isPrimary };
  }

  async renameDistrict(id: string, name: string): Promise<void> {
    const db = await this.db;
    const district = await this.getDistrict(db, id);
    await idbPut(db, 'records', { ...district, name: name.trim() });
  }

  async setPrimaryDistrict(id: string): Promise<void> {
    const db = await this.db;
    await this.getDistrict(db, id);
    for (const d of await this.districts(db)) {
      await idbPut(db, 'records', { ...d, isPrimary: d.id === id });
    }
  }

  async deleteDistrict(id: string): Promise<void> {
    const db = await this.db;
    await this.getDistrict(db, id);
    const tracks = await idbGetAll<TrackRecord>(db, 'records');
    const hasTracks = tracks.some((r) => r.kind === 'track' && r.districtId === id);
    if (hasTracks) {
      throw new RepositoryError(
        'В районе есть треки — сначала перенесите их в другой район.',
      );
    }
    await idbDelete(db, 'records', id);
  }

  async listTracks(districtId: string): Promise<Track[]> {
    const db = await this.db;
    const records = await idbGetAll<TrackRecord>(db, 'records');
    return records
      .filter((r) => r.kind === 'track' && r.districtId === districtId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTrack(id: string): Promise<Track> {
    const db = await this.db;
    const record = await idbGet<TrackRecord>(db, 'records', id);
    if (!record || record.kind !== 'track') throw new RepositoryError('Трек не найден.');
    return record;
  }

  async addTrack(file: File, meta: TrackMetaInput): Promise<Track> {
    const db = await this.db;
    await this.getDistrict(db, meta.districtId);
    const gpxText = await file.text();
    const segments = parseGpxSegments(gpxText);
    const id = crypto.randomUUID();
    const record: TrackRecord = {
      id,
      kind: 'track',
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
    };
    await idbPut(db, 'gpx', {
      id,
      bytes: await file.arrayBuffer(),
    } satisfies GpxRecord);
    await idbPut(db, 'records', record);
    return record;
  }

  async updateTrackMeta(id: string, meta: TrackMetaInput): Promise<void> {
    const db = await this.db;
    await this.getDistrict(db, meta.districtId);
    const record = await this.getTrackRecord(db, id);
    await idbPut(db, 'records', {
      ...record,
      districtId: meta.districtId,
      category: meta.category,
      name: meta.name.trim(),
      description: meta.description?.trim() || null,
    });
  }

  async deleteTrack(id: string): Promise<void> {
    const db = await this.db;
    await this.getTrackRecord(db, id);
    await idbDelete(db, 'records', id);
    await idbDelete(db, 'gpx', id);
  }

  async getGpxText(id: string): Promise<string> {
    const gpx = await this.getGpx(id);
    return (await this.asBlob(gpx)).text();
  }

  async getDownloadUrl(id: string): Promise<string> {
    const gpx = await this.getGpx(id);
    return URL.createObjectURL(await this.asBlob(gpx));
  }

  private async asBlob(gpx: GpxRecord): Promise<Blob> {
    return new Blob([gpx.bytes], { type: 'application/gpx+xml' });
  }

  private async getGpx(id: string): Promise<GpxRecord> {
    const db = await this.db;
    const gpx = await idbGet<GpxRecord>(db, 'gpx', id);
    if (!gpx) throw new RepositoryError('Трек не найден.');
    return gpx;
  }

  private async getTrackRecord(db: IDBDatabase, id: string): Promise<TrackRecord> {
    const record = await idbGet<TrackRecord>(db, 'records', id);
    if (!record || record.kind !== 'track') throw new RepositoryError('Трек не найден.');
    return record;
  }

  private async getDistrict(db: IDBDatabase, id: string): Promise<DistrictRecord> {
    const record = await idbGet<DistrictRecord>(db, 'records', id);
    if (!record || record.kind !== 'district') throw new RepositoryError('Район не найден.');
    return record;
  }

  private async districts(db: IDBDatabase): Promise<DistrictRecord[]> {
    const records = await idbGetAll<DistrictRecord>(db, 'records');
    return records.filter((r) => r.kind === 'district');
  }

  /** Пустая база первого запуска получает основной район «Рядом». */
  private async ensureDefaultDistrict(db: IDBDatabase): Promise<void> {
    if ((await this.districts(db)).length === 0) {
      await idbPut(db, 'records', {
        id: crypto.randomUUID(),
        kind: 'district',
        name: 'Рядом',
        isPrimary: true,
      } satisfies DistrictRecord);
    }
  }
}
