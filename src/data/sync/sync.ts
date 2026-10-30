import type { SyncRecord } from '../local/repository';
import { buildManifest, parseManifest, type Manifest } from './manifest';
import { mergeRecords } from './merge';
import { SyncError } from './relay';

/**
 * Одна кнопка «синхронизироваться»: забрать манифест с облака, слить по датам,
 * применить к локальной базе, донести байты в обе стороны, записать метку
 * последней синхронизации с обеих сторон. Прервалась на середине — повторное
 * нажатие даёт тот же итог (шаги идемпотентны).
 */

export interface SyncRelay {
  health(): Promise<{ status: string; time: string }>;
  listFiles(prefix: string): Promise<{ name: string; size: number; modified: string }[]>;
  getFile(path: string): Promise<ArrayBuffer>;
  putFile(path: string, bytes: ArrayBuffer): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

export interface SyncRepo {
  listAllRecords(): Promise<SyncRecord[]>;
  replaceRecords(records: SyncRecord[]): Promise<void>;
  getGpxBytes(id: string): Promise<ArrayBuffer | null>;
  putGpxBytes(id: string, bytes: ArrayBuffer): Promise<void>;
  getMeta<T>(key: string): Promise<T | null>;
  setMeta(key: string, value: unknown): Promise<void>;
}

export interface SyncReport {
  /** записей пришло с облака. */
  taken: number;
  /** записей уехало на облако. */
  pushed: number;
  /** GPX-файлов выложено/скачано. */
  filesUp: number;
  filesDown: number;
  /** записей менялось на обоих устройствах. */
  conflicts: number;
  /** живых треков, чей файл на Диске не нашёлся. */
  missingFiles: number;
  /** метка этой синхронизации (одна и та же локально и на Диске). */
  syncedAt: string;
  summary(): string;
}

const TRACKS = 'tracks';
const MANIFEST = 'manifest.json';
const LAST_SYNC = 'lastSyncAt';

/** Манифест с облака; null — на Диске его ещё нет (первый запуск). */
export async function readFileManifest(relay: SyncRelay): Promise<Manifest | null> {
  let bytes: ArrayBuffer;
  try {
    bytes = await relay.getFile(MANIFEST);
  } catch (e) {
    if (e instanceof SyncError && e.failure === 'missing') return null;
    throw e;
  }
  const parsed = parseManifest(new TextDecoder().decode(bytes));
  if (!parsed.ok) throw new SyncError('relay', `Копия на Диске нечитаемая: ${parsed.reason}`);
  return parsed.manifest;
}

/** «всё совпадает»: метки равны и локального нового ничего нет. */
async function isUpToDate(
  repo: SyncRepo,
  cloudSyncedAt: string,
  records: SyncRecord[],
): Promise<boolean> {
  const lastSync = await repo.getMeta<string>(LAST_SYNC);
  if (lastSync !== cloudSyncedAt) return false;
  const effective = (r: SyncRecord) => r.deletedAt ?? r.updatedAt;
  return !records.some((r) => effective(r) > lastSync);
}

function summarize(report: Omit<SyncReport, 'summary'>, upToDate: boolean): string {
  if (upToDate) return 'всё совпадает · синхронизировано ранее';
  const parts = ['синхронизировано'];
  const moved = [`забрано ${report.taken}`, `выложено ${report.pushed}`];
  if (report.filesDown) moved.push(`скачано файлов ${report.filesDown}`);
  if (report.filesUp) moved.push(`выложено файлов ${report.filesUp}`);
  parts.push(moved.join(', '));
  if (report.conflicts) parts.push(`конфликтов ${report.conflicts} — победило свежее`);
  if (report.missingFiles) parts.push(`файлы не найдены на Диске: ${report.missingFiles}`);
  return parts.join(' · ');
}

export async function synchronize(repo: SyncRepo, relay: SyncRelay): Promise<SyncReport> {
  const cloudManifest = await readFileManifest(relay);
  const local = await repo.listAllRecords();

  const cloud = cloudManifest?.records ?? [];
  const cloudSyncedAt = cloudManifest?.syncedAt;

  if (cloudSyncedAt && (await isUpToDate(repo, cloudSyncedAt, local))) {
    const syncedAt = cloudSyncedAt;
    return {
      taken: 0,
      pushed: 0,
      filesUp: 0,
      filesDown: 0,
      conflicts: 0,
      missingFiles: 0,
      syncedAt,
      summary: () => summarize(
        {
          taken: 0,
          pushed: 0,
          filesUp: 0,
          filesDown: 0,
          conflicts: 0,
          missingFiles: 0,
          syncedAt,
        },
        true,
      ),
    };
  }

  // 1. Слить и применить к локальной базе — до любого сетевого выкладывания.
  const { merged, report: mergeReport } = mergeRecords(local, cloud);
  await repo.replaceRecords(merged);

  let filesDown = 0;
  let missingFiles = 0;

  // 2. Забрать байты живых треков без локального файла: пришедшие с облака
  // и воскресшие (правка на другом устройстве новее местного надгробия —
  // локальные байты уже стёрты). Уже учтённые как missing не задваиваются.
  const liveTrackIds = merged
    .filter((r) => r.kind === 'track' && !r.deletedAt)
    .map((r) => r.id);
  for (const id of liveTrackIds) {
    if ((await repo.getGpxBytes(id)) !== null) continue;
    try {
      const bytes = await relay.getFile(`${TRACKS}/${id}.gpx`);
      await repo.putGpxBytes(id, bytes);
      filesDown += 1;
    } catch (e) {
      if (e instanceof SyncError && e.failure === 'missing') {
        missingFiles += 1; // запись остаётся, файла нет — честно сказать в сводке
      } else {
        throw e;
      }
    }
  }

  // 3. Сверить файлы на Диске с итогом: доложить недостающие, убрать осиротевшие.
  const remote = new Set((await relay.listFiles(TRACKS)).map((f) => f.name));
  let filesUp = 0;
  for (const record of merged) {
    if (record.kind !== 'track') continue;
    const name = `${record.id}.gpx`;
    if (record.deletedAt) {
      if (remote.has(name)) await relay.deleteFile(`${TRACKS}/${name}`);
      continue;
    }
    if (remote.has(name)) continue;
    const bytes = await repo.getGpxBytes(record.id);
    if (bytes === null) continue; // уже посчитаны в missingFiles на шаге 2
    await relay.putFile(`${TRACKS}/${name}`, bytes);
    filesUp += 1;
  }

  // 4. Метка синхронизации — одна и та же локально и на Диске.
  const syncedAt = new Date().toISOString();
  await relay.putFile(MANIFEST, new TextEncoder().encode(JSON.stringify(buildManifest(merged, syncedAt))).buffer);
  await repo.setMeta(LAST_SYNC, syncedAt);

  const core = {
    taken: mergeReport.taken,
    pushed: mergeReport.pushed,
    filesUp,
    filesDown,
    conflicts: mergeReport.conflicts.length,
    missingFiles,
    syncedAt,
  };
  return { ...core, summary: () => summarize(core, false) };
}
