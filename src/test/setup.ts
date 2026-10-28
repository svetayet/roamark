import '@testing-library/jest-dom/vitest';

// В окружении vitest 4 + jsdom глобальный localStorage может оказаться
// пустым стабом самого Node (--localstorage-file без пути) и перекрывает
// jsdom-овский Storage. Подменяем рабочей in-memory реализацией.
if (typeof localStorage.getItem !== 'function') {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}
