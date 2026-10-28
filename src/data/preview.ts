import type { LatLng } from './types';
import { decimate } from '../logic/geo';
import { PREVIEW_MAX_POINTS } from './repository';

/**
 * Превью полилинии для списков и мини-карт: общий бюджет точек
 * распределяется пропорционально длине сегментов, минимум 2 на сегмент.
 */
export function buildPreview(segments: LatLng[][], budget: number = PREVIEW_MAX_POINTS): LatLng[][] {
  const total = segments.reduce((n, s) => n + s.length, 0);
  if (total <= budget) return segments;
  const shares = segments.map((s) =>
    Math.min(Math.max(2, Math.round((s.length / total) * budget)), s.length),
  );
  // Минимум 2 на сегмент может вытолкнуть сумму за бюджет — режем самые длинные.
  let over = shares.reduce((n, v) => n + v, 0) - budget;
  while (over > 0) {
    let largest = 0;
    for (let i = 1; i < shares.length; i++) if (shares[i] > shares[largest]) largest = i;
    if (shares[largest] <= 2) break;
    shares[largest] -= 1;
    over -= 1;
  }
  return segments.map((s, i) => decimate(s, shares[i]));
}

/** Сериализация превью в колонку БД: «lat,lon;lat,lon|lat,lon…». */
export function encodePreview(segments: LatLng[][]): string {
  return segments
    .map((seg) => seg.map((p) => `${+p.lat},${+p.lon}`).join(';'))
    .join('|');
}

/** Обратное преобразование колонки preview в сегменты. */
export function decodePreview(value: string | null): LatLng[][] {
  if (!value) return [];
  return value
    .split('|')
    .filter((seg) => seg.length > 0)
    .map((seg) =>
      seg
        .split(';')
        .map((pair) => {
          const [lat, lon] = pair.split(',');
          return { lat: Number(lat), lon: Number(lon) };
        })
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)),
    );
}
