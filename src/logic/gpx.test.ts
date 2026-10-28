import { parseGpxSegments, GpxParseError } from './gpx';

const trk = (pts: string) =>
  `<?xml version="1.0"?><gpx version="1.1" creator="test">` +
  `<trk><name>x</name>${pts}</trk></gpx>`;

const trkpt = (lat: number, lon: number) =>
  `<trkpt lat="${lat}" lon="${lon}"></trkpt>`;

test('один trkseg с тремя trkpt даёт один сегмент с координатами', () => {
  const xml = trk(`<trkseg>${trkpt(51.8, 104.9)}${trkpt(51.9, 104.8)}${trkpt(52.0, 105.0)}</trkseg>`);
  const segments = parseGpxSegments(xml);
  expect(segments).toHaveLength(1);
  expect(segments[0]).toEqual([
    { lat: 51.8, lon: 104.9 },
    { lat: 51.9, lon: 104.8 },
    { lat: 52.0, lon: 105.0 },
  ]);
});

test('два trkseg и один rte дают три сегмента в порядке trk, затем rte', () => {
  const xml =
    `<?xml version="1.0"?><gpx version="1.1">` +
    `<trk><trkseg>${trkpt(1, 1)}${trkpt(2, 2)}</trkseg><trkseg>${trkpt(3, 3)}${trkpt(4, 4)}</trkseg></trk>` +
    `<rte><name>r</name><rtept lat="5" lon="5"></rtept><rtept lat="6" lon="6"></rtept></rte>` +
    `</gpx>`;
  const segments = parseGpxSegments(xml);
  expect(segments).toHaveLength(3);
  expect(segments[2][0]).toEqual({ lat: 5, lon: 5 });
});

test('не-GPX файл (html) бросает GpxParseError', () => {
  expect(() => parseGpxSegments('<html><body>фото</body></html>')).toThrow(GpxParseError);
});

test('GPX только с wpt (без точек трека) бросает ошибку с «нет точек»', () => {
  const xml = `<?xml version="1.0"?><gpx version="1.1"><wpt lat="1" lon="2"></wpt></gpx>`;
  expect(() => parseGpxSegments(xml)).toThrow(/нет точек/i);
});

test('пустая строка бросает GpxParseError', () => {
  expect(() => parseGpxSegments('')).toThrow(GpxParseError);
});
