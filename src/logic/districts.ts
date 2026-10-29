import type { District } from '../data/repository';

/** Основной район всегда первый (в подписях он со звёздочкой), прочие — в исходном порядке. */
export function orderDistricts(list: District[]): District[] {
  const primary = list.find((d) => d.isPrimary);
  if (!primary) return list;
  return [primary, ...list.filter((d) => d.id !== primary.id)];
}
