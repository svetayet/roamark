import type { Bounds, LatLng } from '../data/types';

const R = 6371.0088; // средний радиус Земли, км
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Суммарная длина по сегментам; между сегментами расстояние не считается. */
export function segmentsDistanceKm(segments: LatLng[][]): number {
  let total = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      total += haversineKm(seg[i - 1], seg[i]);
    }
  }
  return total;
}

export function segmentsBounds(segments: LatLng[][]): Bounds {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const seg of segments) {
    for (const { lat, lon } of seg) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  return { minLat, minLon, maxLat, maxLon };
}

/**
 * Прореживание до maxItems с сохранением первого и последнего элемента.
 * Массив короче лимита возвращается как есть (тот же объект).
 */
export function decimate<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return items;
  const out: T[] = [];
  const last = items.length - 1;
  for (let i = 0; i < maxItems; i++) {
    const idx = Math.round((i * last) / (maxItems - 1));
    out.push(items[idx]);
  }
  return out;
}
