import { tileLayer, trackLineStyle, decimateSegmentsForRender } from './layers';
import type { LatLng } from '../data/types';

test('tileLayer: light — CyclOSM, dark — CARTO dark_all; атрибуции непустые', () => {
  expect(tileLayer('light').url).toContain('cyclosm');
  expect(tileLayer('dark').url).toContain('dark_all');
  expect(tileLayer('light').attribution.length).toBeGreaterThan(0);
  expect(tileLayer('dark').attribution.length).toBeGreaterThan(0);
});

test('trackLineStyle: светлая тема — тёмно-изумрудный, тёмная — светлее; кант белый 6/3.5', () => {
  expect(trackLineStyle('light').color).toBe('#0F6B51');
  expect(trackLineStyle('dark').color).toBe('#2E9B72');
  for (const mode of ['light', 'dark'] as const) {
    const s = trackLineStyle(mode);
    expect(s.casingColor).toBe('#FFFFFF');
    expect(s.casingWeight).toBe(6);
    expect(s.weight).toBe(3.5);
  }
});

test('decimateSegmentsForRender: гигантский трек ≤1500 точек, концы сегментов сохранены', () => {
  const pt = (lat: number, lon: number): LatLng => ({ lat, lon });
  const huge = Array.from({ length: 40000 }, (_, i) => pt(51 + i * 1e-5, 104 + i * 1e-5));
  const another = Array.from({ length: 30 }, (_, i) => pt(52 + i * 1e-3, 105 + i * 1e-3));
  const result = decimateSegmentsForRender([huge, another]);
  const total = result.reduce((n, s) => n + s.length, 0);
  expect(total).toBeLessThanOrEqual(1500);
  expect(result[0][0]).toEqual(huge[0]);
  expect(result[0].at(-1)).toEqual(huge.at(-1));
  expect(result[1][0]).toEqual(another[0]);
  expect(result[1].at(-1)).toEqual(another.at(-1));
});

test('decimateSegmentsForRender: короткие сегменты проходят без изменений', () => {
  const segments: LatLng[][] = [
    [
      { lat: 51.8, lon: 104.9 },
      { lat: 51.9, lon: 104.8 },
    ],
  ];
  expect(decimateSegmentsForRender(segments)).toEqual(segments);
});
