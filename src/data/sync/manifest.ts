import type { SyncRecord } from '../local/repository';

export type { SyncRecord };

/** Формат копии на Диске. version — версия формата, не количество правок. */
export interface Manifest {
  version: 1;
  /** Метка последней синхронизации на Диске (запрос владелицы 2026-10-30). */
  syncedAt: string;
  records: SyncRecord[];
}

export function buildManifest(records: SyncRecord[], syncedAt: string): Manifest {
  return { version: 1, syncedAt, records };
}

export type ParsedManifest = { ok: true; manifest: Manifest } | { ok: false; reason: string };

/**
 * Чужой или битый манифест — честная ошибка: молча считать облако пустым
 * нельзя (стиралось бы локальное), показать причину.
 */
export function parseManifest(text: string): ParsedManifest {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'Копия на Диске не читается как JSON.' };
  }
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as { version?: unknown }).version !== 1 ||
    typeof (data as { syncedAt?: unknown }).syncedAt !== 'string' ||
    !Array.isArray((data as { records?: unknown }).records)
  ) {
    return { ok: false, reason: 'Копия на Диске другой версии или неполная.' };
  }
  return { ok: true, manifest: data as Manifest };
}
