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
import { idbDelete, idbGet, idbGetAll, idbPut, idbReplaceAll, openDb } from './idb';

/** Ошибка парсера — тоже RepositoryError: внешние обработчики показывают текст только у него. */
function parseOrRepositoryError(gpxText: string) {
  try {
    return parseGpxSegments(gpxText);
  } catch (e) {
    throw new RepositoryError(e instanceof Error ? e.message : 'Не удалось прочитать файл.');
  }
}

/**
 * Запись синхронизации: любая запись библиотеки со служебными датами —
 * уходит в манифест целиком, включая надгробия (deletedAt не-null).
 */
export interface SyncRecord {
  id: string;
  kind: 'district' | 'track';
  updatedAt: string;
  deletedAt: string | null;
  [field: string]: unknown;
}

/** Эпоха для записей базы этапа 1 — у тех нет ни updatedAt, ни createdAt. */
const EPOCH = '1970-01-01T00:00:00.000Z';

const now = () => new Date().toISOString();

/** Нормализация записи при чтении: даты этапа 1 подставляются на месте. */
function asSyncRecord(raw: Record<string, unknown>): SyncRecord {
  return {
    ...(raw as object),
    id: raw.id as string,
    kind: raw.kind as 'district' | 'track',
    updatedAt: (raw.updatedAt as string) ?? (raw.createdAt as string) ?? EPOCH,
    deletedAt: (raw.deletedAt as string | null) ?? null,
  };
}

/**
 * Локальная реализация TrackRepository: все данные и GPX-файлы живут
 * в браузере (IndexedDB), чтение мгновенное и работает без сети.
 * Первый запуск на пустой базе создаёт основной район «Рядом» —
 * того же требует InMemoryTrackRepository в тестах.
 *
 * Даты и надгробия: каждое изменение ставит updatedAt; удаление — надгробие
 * (deletedAt), чтобы доехало до других устройств при синхронизации.
 */

type DistrictRecord = { id: string; kind: 'district' } & District & {
  updatedAt: string;
  deletedAt: string | null;
};
type TrackRecord = { id: string; kind: 'track' } & Track & {
  updatedAt: string;
  deletedAt: string | null;
};
/** Байты GPX хранятся как ArrayBuffer — Blob собирается при чтении. */
type GpxRecord = { id: string; bytes: ArrayBuffer };

export class LocalTrackRepository implements TrackRepository {
  private readonly db: Promise<IDBDatabase>;

  constructor(dbName: string = 'roamark') {
    this.db = openDb(dbName, 2, (db) => {
      // База этапа 1 уже держит records и gpx — создать существующий стор
      // нельзя (DOMException), поэтому добавляем только недостающее.
      for (const store of ['records', 'gpx', 'meta']) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
    }).then(async (db) => {
      await this.ensureDefaultDistrict(db);
      return db;
    });
  }

  async listDistricts(): Promise<District[]> {
    const db = await this.db;
    const records = await idbGetAll<DistrictRecord>(db, 'records');
    return records
      .filter((r) => r.kind === 'district' && !r.deletedAt)
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
      updatedAt: now(),
      deletedAt: null,
    };
    await idbPut(db, 'records', record);
    return { id: record.id, name: record.name, isPrimary: record.isPrimary };
  }

  async renameDistrict(id: string, name: string): Promise<void> {
    const db = await this.db;
    const district = await this.getDistrict(db, id);
    await idbPut(db, 'records', { ...district, name: name.trim(), updatedAt: now() });
  }

  async setPrimaryDistrict(id: string): Promise<void> {
    const db = await this.db;
    await this.getDistrict(db, id);
    // Дата растёт только у избранного: снимаемые флаги — не «правка» района,
    // иначе бывший основной станет свежее нового и спутает слияние.
    for (const d of await this.districts(db)) {
      const becomesPrimary = d.id === id;
      if (becomesPrimary || d.isPrimary) {
        await idbPut(db, 'records', {
          ...d,
          isPrimary: becomesPrimary,
          ...(becomesPrimary ? { updatedAt: now() } : {}),
        });
      }
    }
  }

  async deleteDistrict(id: string): Promise<void> {
    const db = await this.db;
    const district = await this.getDistrict(db, id);
    const tracks = await idbGetAll<TrackRecord>(db, 'records');
    const hasTracks = tracks.some((r) => r.kind === 'track' && !r.deletedAt && r.districtId === id);
    if (hasTracks) {
      throw new RepositoryError(
        'В районе есть треки — сначала перенесите их в другой район.',
      );
    }
    await idbPut(db, 'records', { ...district, updatedAt: now(), deletedAt: now() });
  }

  async listTracks(districtId: string): Promise<Track[]> {
    const db = await this.db;
    const records = await idbGetAll<TrackRecord>(db, 'records');
    return records
      .filter((r) => r.kind === 'track' && !r.deletedAt && r.districtId === districtId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTrack(id: string): Promise<Track> {
    const db = await this.db;
    const record = await idbGet<TrackRecord>(db, 'records', id);
    if (!record || record.kind !== 'track' || record.deletedAt) {
      throw new RepositoryError('Трек не найден.');
    }
    return record;
  }

  async addTrack(file: File, meta: TrackMetaInput): Promise<Track> {
    const db = await this.db;
    await this.getDistrict(db, meta.districtId);
    const gpxText = await file.text();
    const segments = parseOrRepositoryError(gpxText);
    const id = crypto.randomUUID();
    const createdAt = now();
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
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
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
      updatedAt: now(),
    });
  }

  async deleteTrack(id: string): Promise<void> {
    const db = await this.db;
    const record = await this.getTrackRecord(db, id);
    // Надгробие вместо стирания: удаление должно доехать до других устройств.
    await idbPut(db, 'records', { ...record, updatedAt: now(), deletedAt: now() });
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

  // —– синхронизация: доступ к сырым записям, байтам и meta ——

  async listAllRecords(): Promise<SyncRecord[]> {
    const db = await this.db;
    const raw = await idbGetAll<Record<string, unknown>>(db, 'records');
    return raw.map(asSyncRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Итог слияния записывается целиком одной транзакцией, даты не пересчитываются. */
  async replaceRecords(records: SyncRecord[]): Promise<void> {
    const db = await this.db;
    await idbReplaceAll(db, 'records', records as { id: string }[]);
  }

  async getGpxBytes(id: string): Promise<ArrayBuffer | null> {
    const db = await this.db;
    return (await idbGet<GpxRecord>(db, 'gpx', id))?.bytes ?? null;
  }

  async putGpxBytes(id: string, bytes: ArrayBuffer): Promise<void> {
    const db = await this.db;
    await idbPut(db, 'gpx', { id, bytes } satisfies GpxRecord);
  }

  async getMeta<T>(key: string): Promise<T | null> {
    const db = await this.db;
    return ((await idbGet<{ id: string; value: T }>(db, 'meta', key))?.value ?? null) as T | null;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const db = await this.db;
    await idbPut(db, 'meta', { id: key, value });
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
    if (!record || record.kind !== 'track' || record.deletedAt) {
      throw new RepositoryError('Трек не найден.');
    }
    return record;
  }

  private async getDistrict(db: IDBDatabase, id: string): Promise<DistrictRecord> {
    const record = await idbGet<DistrictRecord>(db, 'records', id);
    if (!record || record.kind !== 'district' || record.deletedAt) {
      throw new RepositoryError('Район не найден.');
    }
    return record;
  }

  /** Только живые районы. */
  private async districts(db: IDBDatabase): Promise<DistrictRecord[]> {
    const records = await idbGetAll<DistrictRecord>(db, 'records');
    return records.filter((r) => r.kind === 'district' && !r.deletedAt);
  }

  /** Пустая база первого запуска получает основной район «Рядом». */
  private async ensureDefaultDistrict(db: IDBDatabase): Promise<void> {
    if ((await this.districts(db)).length === 0) {
      await idbPut(db, 'records', {
        id: crypto.randomUUID(),
        kind: 'district',
        name: 'Рядом',
        isPrimary: true,
        updatedAt: now(),
        deletedAt: null,
      } satisfies DistrictRecord);
    }
  }
}
