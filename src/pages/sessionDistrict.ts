/**
 * Текущий район главной страницы живёт в sessionStorage —
 * страница добавления подставляет его же по умолчанию.
 */
export const DISTRICT_KEY = 'roamark.district';

export function readSelectedDistrict(): string | null {
  try {
    return sessionStorage.getItem(DISTRICT_KEY);
  } catch {
    return null;
  }
}

export function writeSelectedDistrict(id: string): void {
  try {
    sessionStorage.setItem(DISTRICT_KEY, id);
  } catch {
    /* без sessionStorage выбор живёт до перезагрузки */
  }
}
