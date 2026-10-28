import { haversineKm, segmentsDistanceKm, segmentsBounds, decimate } from './geo';

test('haversine: один градус долготы на экваторе ≈ 111,19 км', () => {
  const km = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  expect(km).toBeGreaterThan(111.09);
  expect(km).toBeLessThan(111.29);
});

test('длина сегментов суммируется внутри сегментов, но не между ними', () => {
  const segments = [
    [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
    ],
    [
      { lat: 0, lon: 10 },
      { lat: 0, lon: 11 },
    ],
  ];
  const perSegment = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  expect(segmentsDistanceKm(segments)).toBeCloseTo(perSegment * 2, 6);
});

test('bounds охватывает все точки всех сегментов', () => {
  const segments = [
    [
      { lat: 51, lon: 104 },
      { lat: 53, lon: 103 },
    ],
    [{ lat: 52, lon: 106 }],
  ];
  expect(segmentsBounds(segments)).toEqual({
    minLat: 51,
    minLon: 103,
    maxLat: 53,
    maxLon: 106,
  });
});

test('decimate до 5 сохраняет длину и оба конца', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const out = decimate(items, 5);
  expect(out).toHaveLength(5);
  expect(out[0]).toBe(1);
  expect(out[out.length - 1]).toBe(10);
});

test('decimate массива короче лимита возвращает его без изменений', () => {
  const items = [1, 2, 3];
  expect(decimate(items, 100)).toBe(items);
});
