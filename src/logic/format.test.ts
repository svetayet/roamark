import { formatKm, validateTrackMeta } from './format';

test('formatKm округляет до одного знака с русской запятой', () => {
  // 12.345 в float = 12.3449…, поэтому честное округление — 12,3
  expect(formatKm(12.345)).toBe('12,3 км');
  expect(formatKm(3.26)).toBe('3,3 км');
});

test('formatKm без дробной части не пишет ноль', () => {
  expect(formatKm(100)).toBe('100 км');
});

test('formatKm меньшой километраж всё равно с одним знаком', () => {
  expect(formatKm(0.43)).toBe('0,4 км');
});

test('validateTrackMeta: пустое имя — ошибка', () => {
  const errors = validateTrackMeta({
    districtId: 'd1',
    category: 'hike',
    name: '   ',
  });
  expect(errors.length).toBeGreaterThan(0);
});

test('validateTrackMeta: имя длиннее 200 символов — ошибка', () => {
  const errors = validateTrackMeta({
    districtId: 'd1',
    category: 'hike',
    name: 'а'.repeat(201),
  });
  expect(errors.length).toBeGreaterThan(0);
});

test('validateTrackMeta: описание длиннее 1000 символов — ошибка', () => {
  const errors = validateTrackMeta({
    districtId: 'd1',
    category: 'hike',
    name: 'Трек',
    description: 'б'.repeat(1001),
  });
  expect(errors.length).toBeGreaterThan(0);
});

test('validateTrackMeta: корректный ввод без ошибок', () => {
  const errors = validateTrackMeta({
    districtId: 'd1',
    category: 'ski',
    name: 'Лыжня у залива',
    description: 'катили по льду',
  });
  expect(errors).toEqual([]);
});
