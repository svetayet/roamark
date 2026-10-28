import type { LatLng } from '../data/types';

export class GpxParseError extends Error {}

/**
 * Разбор GPX в сегменты точек: каждый trkseg — свой сегмент,
 * все rtept собираются в один сегмент после trk-сегментов. wpt игнорируются.
 * Бросает GpxParseError с понятным сообщением на битые файлы и файлы без точек трека.
 */
export function parseGpxSegments(xml: string): LatLng[][] {
  if (!xml.trim()) {
    throw new GpxParseError('Пустой файл — это не GPX-трек.');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new GpxParseError('Не удалось прочитать файл — похоже, это не GPX.');
  }
  const segments: LatLng[][] = [];
  for (const seg of Array.from(doc.getElementsByTagName('trkseg'))) {
    const points = parsePoints(seg.getElementsByTagName('trkpt'));
    if (points.length > 0) segments.push(points);
  }
  const rtePoints = parsePoints(doc.getElementsByTagName('rtept'));
  if (rtePoints.length > 0) segments.push(rtePoints);
  if (segments.length === 0) {
    throw new GpxParseError('В файле нет точек трека.');
  }
  return segments;
}

function parsePoints(elements: HTMLCollectionOf<Element>): LatLng[] {
  const points: LatLng[] = [];
  for (const el of Array.from(elements)) {
    const lat = Number(el.getAttribute('lat'));
    const lon = Number(el.getAttribute('lon'));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push({ lat, lon });
    }
  }
  return points;
}
