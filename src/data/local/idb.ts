/**
 * Минимальная обёртка над IndexedDB: промисы вместо событий,
 * ничего лишнего. Контракт: у каждого значения есть поле id,
 * objectStore создаётся с keyPath 'id'.
 */

export function openDb(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('не удалось открыть базу'));
  });
}

/** Удаление тестовой базы между проверками. */
export function deleteDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('не удалось удалить базу'));
    // Базы могло не быть — это успех для наших целей.
    request.onblocked = () => resolve();
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('хранилище: операция не удалась'));
    tx.onabort = () => reject(tx.error ?? new Error('хранилище: операция прервана'));
  });
}

export function idbPut<T extends { id: string }>(db: IDBDatabase, store: string, value: T): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return done(tx);
}

export function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error('хранилище: чтение не удалось'));
  });
}

export function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('хранилище: чтение не удалось'));
  });
}

export function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

export function idbClear(db: IDBDatabase, store: string): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  return done(tx);
}
