import { orderDistricts } from './districts';
import type { District } from '../data/repository';

const d = (id: string, isPrimary: boolean): District => ({
  id,
  name: id.toUpperCase(),
  isPrimary,
});

test('orderDistricts: основной район первым, прочие в исходном порядке', () => {
  const list = [d('a', false), d('b', false), d('c', true), d('e', false)];
  expect(orderDistricts(list).map((x) => x.id)).toEqual(['c', 'a', 'b', 'e']);
});

test('orderDistricts: без основного порядок не меняется', () => {
  const list = [d('a', false), d('b', false)];
  expect(orderDistricts(list).map((x) => x.id)).toEqual(['a', 'b']);
});
