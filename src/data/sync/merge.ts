import type { SyncRecord } from '../local/repository';

/**
 * По-записное слияние «новее главнее» (правило владелицы, смягчённое до
 * уровня записи). Одинаковые входы на любом устройстве дают одинаковый итог:
 * даты решают, при равенстве дат — лексикографически больший канонический JSON.
 */

export interface MergeReport {
  /** записей пришло с облака (были только там). */
  taken: number;
  /** записей уйдёт на облако (есть только локально). */
  pushed: number;
  /** запись менялась с обеих сторон — чья версия осталась. */
  conflicts: { id: string; winner: 'local' | 'cloud' }[];
}

/** Канонический вид записи: ключи отсортированы на любом уровне вложенности. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/** Эффективная дата записи: когда её реально меняли в последний раз. */
function effectiveDate(record: SyncRecord): string {
  return record.deletedAt ?? record.updatedAt;
}

function reviveOrphanDistricts(records: SyncRecord[]): void {
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const record of records) {
    if (record.kind !== 'track' || record.deletedAt) continue;
    const district = byId.get(record.districtId as string);
    if (!district || district.deletedAt) {
      // Живой трек ссылается на отсутствующий/удалённый район — район
      // воскресает, иначе трек повиснет в воздухе.
      if (district) district.deletedAt = null;
    }
  }
}

/** Инвариант «ровно один основной район»: самый свежий из isPrimary. */
function fixPrimaryDistrict(records: SyncRecord[]): void {
  const alive = records.filter((r) => r.kind === 'district' && !r.deletedAt);
  const claiming = alive.filter((r) => r.isPrimary === true);
  const pool = claiming.length > 0 ? claiming : alive;
  const winner = pool.reduce<SyncRecord | null>(
    (best, r) => (!best || r.updatedAt > best.updatedAt ? r : best),
    null,
  );
  for (const district of alive) district.isPrimary = district.id === winner?.id;
}

export function mergeRecords(
  local: SyncRecord[],
  cloud: SyncRecord[],
): { merged: SyncRecord[]; report: MergeReport } {
  const cloudById = new Map(cloud.map((r) => [r.id, r]));
  const merged: SyncRecord[] = [];
  const report: MergeReport = { taken: 0, pushed: 0, conflicts: [] };

  const settle = (a: SyncRecord, b: SyncRecord): SyncRecord => {
    const dateA = effectiveDate(a);
    const dateB = effectiveDate(b);
    if (dateA !== dateB) return dateA > dateB ? a : b;
    return canonical(a) >= canonical(b) ? a : b; // тай-брейк симметричен на обоих устройствах
  };

  for (const record of local) {
    const other = cloudById.get(record.id);
    if (!other) {
      merged.push(record);
      report.pushed += 1;
      continue;
    }
    cloudById.delete(record.id);
    if (canonical(record) !== canonical(other)) {
      const winner = settle(record, other);
      merged.push(winner);
      report.conflicts.push({ id: record.id, winner: winner === record ? 'local' : 'cloud' });
    } else {
      merged.push(record); // идентичны — просто оставляем
    }
  }
  for (const record of cloudById.values()) {
    merged.push(record);
    report.taken += 1;
  }

  const normalized = merged.map((r) => ({ ...r })); // не мутировать входы
  reviveOrphanDistricts(normalized);
  fixPrimaryDistrict(normalized);
  return { merged: normalized.sort((a, b) => a.id.localeCompare(b.id)), report };
}
