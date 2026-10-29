/**
 * Одноразовый перехват OAuth-токена Яндекса из адресной строки.
 * После согласия Яндекс возвращает владелицу на сайт с фрагментом
 * #access_token=… — HashRouter счёл бы его маршрутом и тут же затёр.
 * Модуль исполняется в main.tsx до рендера: забирает токен в память
 * и стирает фрагмент. В localStorage токен не попадает никогда.
 */

let captured: string | null = null;

const match = window.location.hash.match(/access_token=([^&]+)/);
if (match) {
  captured = decodeURIComponent(match[1]);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** Отдаёт перехваченный токен один раз — страница #/spike подставит его в поле. */
export function takeCapturedToken(): string | null {
  const token = captured;
  captured = null;
  return token;
}
