import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// В окружении vitest 4 + jsdom глобальный localStorage/sessionStorage может
// оказаться пустым стабом самого Node (--localstorage-file без пути) и
// перекрывает jsdom-овский Storage. Подменяем рабочей in-memory реализацией.
function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const current = globalThis[name];
  if (typeof current?.getItem !== 'function') {
    const storage = makeStorage();
    Object.defineProperty(window, name, { value: storage, configurable: true });
    Object.defineProperty(globalThis, name, { value: storage, configurable: true });
  }
}

// Кэш и выбранный район живут в localStorage/sessionStorage — между тестами
// состояние не должно протекать.
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// jsdom без matchMedia — ThemeProvider слушает системную тему.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}
