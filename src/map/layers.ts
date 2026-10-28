import type { LatLng } from '../data/types';
import { decimate } from '../logic/geo';

/** Подложки: CyclOSM (светлая) / CARTO dark_all (тёмная). Атрибуция обязательна. */
export function tileLayer(mode: 'light' | 'dark'): { url: string; attribution: string } {
  return mode === 'light'
    ? {
        url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        attribution: 'CyclOSM | © OpenStreetMap contributors',
      }
    : {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '© OpenStreetMap contributors © CARTO',
      };
}

/** Стиль линии трека: изумруд из палитры «ель», белый кант под ней. */
export function trackLineStyle(mode: 'light' | 'dark'): {
  color: string;
  weight: number;
  casingColor: string;
  casingWeight: number;
} {
  return {
    color: mode === 'light' ? '#0F6B51' : '#2E9B72',
    weight: 3.5,
    casingColor: '#FFFFFF',
    casingWeight: 6,
  };
}

/**
 * Упрощение полилинии для отрисовки: общий бюджет точек распределяется
 * пропорционально длине сегментов, минимум 2 точки на сегмент.
 * Гигантский GPX (десятки тысяч точек) не должен подвешивать Leaflet.
 */
export function decimateSegmentsForRender(
  segments: LatLng[][],
  maxPoints = 1500,
): LatLng[][] {
  const total = segments.reduce((n, s) => n + s.length, 0);
  if (total <= maxPoints) return segments;
  const shares = segments.map((s) =>
    Math.min(Math.max(2, Math.round((s.length / total) * maxPoints)), s.length),
  );
  // Минимум 2 на сегмент может вытолкнуть сумму за бюджет — режем самые длинные.
  let over = shares.reduce((n, v) => n + v, 0) - maxPoints;
  while (over > 0) {
    let largest = 0;
    for (let i = 1; i < shares.length; i++) if (shares[i] > shares[largest]) largest = i;
    if (shares[largest] <= 2) break;
    shares[largest] -= 1;
    over -= 1;
  }
  return segments.map((s, i) => decimate(s, shares[i]));
}
