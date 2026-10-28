import type { Category, TrackMetaInput } from '../data/types';

const kmFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** «12,4 км» — русский формат, один знак после запятой. */
export function formatKm(km: number): string {
  return `${kmFormatter.format(km)} км`;
}

const CATEGORIES: Category[] = ['hike', 'bike', 'run', 'ski'];

/** Человекочитаемые ошибки формы трека; пустой массив = всё валидно. */
export function validateTrackMeta(input: TrackMetaInput): string[] {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) {
    errors.push('Введите название трека.');
  } else if (name.length > 200) {
    errors.push('Название — до 200 символов.');
  }
  if (input.description && input.description.length > 1000) {
    errors.push('Описание — до 1000 символов.');
  }
  if (!CATEGORIES.includes(input.category)) {
    errors.push('Выберите категорию: пеший, вело, бег или лыжи.');
  }
  if (!input.districtId) {
    errors.push('Выберите район.');
  }
  return errors;
}
