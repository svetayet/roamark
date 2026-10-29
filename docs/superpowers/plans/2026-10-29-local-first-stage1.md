# roaMark локальное хранилище (этап 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приложение хранит всё локально в IndexedDB, открывается сразу в библиотеку без экрана входа; Supabase полностью удаляется; добавляется временная spike-страница проверки байтового домена Яндекса.

**Architecture:** Новый `LocalTrackRepository` реализует существующий интерфейс `TrackRepository` поверх IndexedDB (обёртка своя, минимальная). Auth-методы уходят из интерфейса, `RepoContext` всегда отдаёт локальный репозиторий. Supabase-код, миграции, env и keep-alive workflow удаляются. Синхронизация (этап 2) — отдельный план после spike.

**Tech Stack:** Vite + React 19 + TS strict, Vitest 4 + Testing Library (globals), dev-зависимость `fake-indexeddb` для тестов IDB в jsdom.

**Spec:** `docs/superpowers/specs/2026-10-29-local-first-sync-design.md` (этап 1 + разделы «Локальное хранилище», «Ответы владелицы», «Решения строителя»).

## Global Constraints

- Весь UI-текст по-русски, обращение на «ты», женский род; копия из мокапа `mockups/sync-settings.html`.
- Скачивание GPX — байт-в-байт под исходным именем (Blob → `URL.createObjectURL`, не data:-URL).
- Никаких секретов в коде/репозитории; токен Яндекса появится только в этапе 2 и только в localStorage.
- TDD: проваливающийся тест → минимальный код; перед каждым commit — зелёный suite; `npm run build` обязателен перед push (tsc -b ловит то, что vitest не проверяет).
- Новых runtime-зависимостей не добавляем; `fake-indexeddb` — только devDependency.
- Демо-режим, кэш localStorage (`homeCache`), повторы (`retry.ts`) и экран входа удаляются.

## Review Focus

1. **Скачивание байт-в-байт с не-ASCII содержимым** — GPX с кириллицей возвращается теми же байтами, что загружены (data:-URL ломал бы это). Тест в Task 2 (`байты`).
2. **Первый запуск пустой базы** — приложение открывает главную сразу (без /login), списке районов есть основной «Рядом». Тесты в Task 2 (сид) и Task 3 (маршруты).
3. **Перезагрузка страницы не теряет данные** — второй экземпляр репозитория над той же базой видит треки первого. Тест в Task 2 (`переживает`).
4. **Удаление района с треками и добавление битого GPX** — человеческие сообщения об ошибках, не сырые исключения. Тесты в Task 2.
5. **Ошибка локального чтения не оставляет вечный экран** — на главном остаётся сообщение и «повторить». Тест в Task 4.

---

### Task 1: Обёртка IndexedDB + fake-indexeddb в тестах

**Files:**
- Create: `src/data/local/idb.ts`
- Test: `src/data/local/idb.test.ts`
- Modify: `package.json` (devDependencies), `src/test/setup.ts`, lockfile (`npm install`)

**Interfaces:**
- Produces: `openDb(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase>`;
  `idbPut(db: IDBDatabase, store: string, value: object): Promise<void>`;
  `idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined>`;
  `idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]>`;
  `idbDelete(db: IDBDatabase, store: string, key: string): Promise<void>`.
  Все операции — через краткоживущие транзакции readwrite/readonly, ожидание `oncomplete`.

- [ ] **Step 1: Подключить fake-indexeddb**

`npm install -D fake-indexeddb` (проверенная стабильная версия — `^6`); в `src/test/setup.ts` первой строкой `import 'fake-indexeddb/auto';`.

- [ ] **Step 2: Написать проваливающиеся тесты обёртки**

Тесты (`roundtrip`, `getAll возвращает всё`, `get несуществующего → undefined`, `delete убирает запись`): открывают базу с upgrade, создающим objectStore `'records'` (keyPath отсутствует — ключ передаётся явным `idbPut(db, store, value & { id })`? Нет — положить key внутрь значения не выйдет без keyPath; обёртка хранит значения с ключом внутри: контракт — у каждого значения есть поле `id: string`, store создаётся с `keyPath: 'id'`. Зафиксировать это в тесте).

- [ ] **Step 3: Запустить, убедиться в провале**

Run: `npx vitest run src/data/local/idb.test.ts`
Expected: FAIL — модуль `./idb` не существует.

- [ ] **Step 4: Реализовать `idb.ts`**

`openDb` оборачивает `indexedDB.open` + `onupgradeneeded` → `upgrade(db)`; прочие — фабрика транзакции с промисом `oncomplete/onerror` (`onerror` → reject `Error('хранилище: операция не удалась')`).

- [ ] **Step 5: Прогнать тест и весь suite**

Run: `npx vitest run src/data/local/idb.test.ts` → PASS; `npm test` → всё зелёное.

- [ ] **Step 6: Commit**

`feat: обёртка IndexedDB для локального хранилища`

### Task 2: LocalTrackRepository

**Files:**
- Create: `src/data/local/repository.ts`
- Test: `src/data/local/repository.test.ts`

**Interfaces:**
- Consumes: `idb.ts` (Task 1); `parseGpxSegments` (`src/logic/gpx`), `segmentsDistanceKm`/`segmentsBounds` (`src/logic/geo`), `buildPreview` (`src/data/preview`); `TrackRepository`, `RepositoryError`, `PREVIEW_MAX_POINTS` (`src/data/repository`).
- Produces: `class LocalTrackRepository implements TrackRepository` (полный текущий интерфейс; auth-методы — временные заглушки: `getSession() → { email: 'local' }`, `sendMagicLink`/`signOut` → resolve, `onAuth(cb)` → возвращает `() => {}`); `constructor(dbName: string = 'roamark')`.
  Схема базы v1: store `records` (keyPath `id`; записи `district` и `track`), store `gpx` (keyPath `id` трека, значение `{ id, blob: Blob }`).

- [ ] **Step 1: Написать проваливающиеся тесты репозитория**

Тесты (каждый — свой `dbName`, чтобы изолировать базы):
  - `первый запуск: создаётся основной район «Рядом»` — новый `LocalTrackRepository(uniqueDb)`, `listDistricts()` → один район `isPrimary: true`, имя «Рядом».
  - `районы: создание/переименование/смена основного/удаление с треком даёт человеческую ошибку` (последний — `rejects.toThrow('В районе есть треки')`).
  - `addTrack считает километраж и сохраняет мета` — из фикстуры GPX (взять из `src/data/memory.test.ts` / существующих тестов), проверить `distanceKm > 0`, `originalFilename`, `name`, `description`, `createdAt`.
  - `байты: скачивание байт-в-байт, включая кириллицу` — GPX с кириллическим текстом внутри и именем файла `кольцо-падуна.gpx`; `vi.spyOn(URL, 'createObjectURL')` перехватывает Blob; `getDownloadUrl(id)`; перехваченный `blob.arrayBuffer()` байт-в-байт равен `await file.arrayBuffer()`.
  - `переживает переоткрытие` — repo1: addTrack; repo2 (тот же dbName): `listTracks`/`getGpxText` видят трек.
  - `битый GPX → человеческая ошибка` — файл с текстом «не xml»: `addTrack` rejects `RepositoryError` с понятным сообщением.
  - `getGpxText возвращает исходный текст`.

- [ ] **Step 2: Запустить, убедиться в провале**

Run: `npx vitest run src/data/local/repository.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать репозиторий**

Данные-методы повторяют поведение `InMemoryTrackRepository` (`src/data/memory.ts`): сортировка районов по `localeCompare('ru')`, треков — по `createdAt` убыв.; `deleteDistrict` с треками → `RepositoryError('В районе есть треки — сначала перенесите их в другой район.')`; первый `listDistricts` на пустой базе сеет «Рядом». Хранение: district- и track-записи в `records` (у записи поле `kind: 'district' | 'track'`), байты GPX — `Blob` в `gpx`. `addTrack` читает `file.arrayBuffer()` → Blob; парс через `parseGpxSegments(file.text())`, ошибки парсера оборачивать в `RepositoryError` с сообщением по-русски. `getDownloadUrl` → `URL.createObjectURL(blob)`.

- [ ] **Step 4: Прогнать тесты и весь suite**

Run: `npx vitest run src/data/local/repository.test.ts` → PASS; `npm test` → зелёное.

- [ ] **Step 5: Commit**

`feat: локальный репозиторий на IndexedDB`

### Task 3: Приложение на локальных рельсах — вход исчезает

**Files:**
- Modify: `src/data/repository.ts` (интерфейс), `src/data/RepoContext.tsx`, `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/data/memory.ts`, `src/pages/HomePage.test.tsx` (`new InMemoryTrackRepository({ demo: true })` → `new InMemoryTrackRepository()`), тесты памяти/входа
- Delete: `src/pages/LoginPage.tsx`, `src/pages/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `LocalTrackRepository` (Task 2).
- Produces: `TrackRepository` без `getSession/sendMagicLink/signOut/onAuth`; `RepoProvider` без env-выбора — default `new LocalTrackRepository()`; App без гейта сессии и маршрута `/login`; `InMemoryTrackRepository` без auth и `requireSession`, конструктор без опций, сеет «Рядом» при пустой карте.

- [ ] **Step 1: Обновить тесты — провал**

В тестах, где вход/сессия: `App`-тест (если есть проверка редиректа на `/login` — заменить на «сразу главная»), тесты памяти с `sendMagicLink`/«Нужно войти» — удалить/заменить на поведение без сессии. Новый тест `App`: рендер `<App/>` → `findByRole('combobox')` без всякого ввода емейла.

- [ ] **Step 2: Убедиться в провале**

Run: `npm test` → FAIL (старый код ещё требует вход).

- [ ] **Step 3: Переключить**

`RepoContext`: убрать supabase-импорт и env-ветку, default — `new LocalTrackRepository()`. `App`: убрать session-гейт, `onAuth`, маршрут и импорт `LoginPage`. Интерфейс: удалить 4 auth-метода; убрать их из `LocalTrackRepository` (заглушки Task 2) и `InMemoryTrackRepository` (+`requireSession`, опция `demo`). `SettingsPage`: удалить `logout` и кнопку «выйти».

- [ ] **Step 4: Прогнать всё + build**

Run: `npm test` → зелёное; `npm run build` → без ошибок TS.

- [ ] **Step 5: Commit**

`feat: вход удалён, приложение работает на локальной базе`

### Task 4: Главная без кэша и повторов

**Files:**
- Modify: `src/pages/HomePage.tsx`, `src/pages/HomePage.test.tsx`
- Delete: `src/pages/homeCache.ts`, `src/pages/homeCache.test.ts`, `src/logic/retry.ts`, `src/logic/retry.test.ts`

**Interfaces:**
- Consumes: локальный репозиторий (чтение мгновенное, но асинхронное).
- Produces: HomePage с простым `loading`-флагом без кэша; на отказ чтения — сообщение «не получилось загрузить» + кнопка «повторить» (без авто-повторов).

- [ ] **Step 1: Обновить тесты главной — провал**

Оставить/обновить: базовые тесты списка (findBy уже есть); тест «отказ чтения → сообщение и кнопка `повторить` лечит» (spy `listDistricts` reject → потом рабочий impl). Удалить тесты кэша и авто-повторов.

- [ ] **Step 2: Убедиться в провале/старом поведении**

Run: `npm test` → FAIL по изменённым тестам.

- [ ] **Step 3: Упростить HomePage**

Убрать импорты `withRetry`/`homeCache*`, состояния `loadFailed`/`tracksFailed` свести к одному пути ошибки; `readSelectedDistrict`/`writeSelectedDistrict` остаются. Удалить файлы кэша и retry.

- [ ] **Step 4: Прогнать всё + build**

Run: `npm test` → зелёное; `npm run build` → чисто.

- [ ] **Step 5: Commit**

`refactor: главная без кэша и авто-повторов — чтение локальное`

### Task 5: Supabase уходит из проекта совсем

**Files:**
- Delete: `src/data/supabase/` (весь каталог), `supabase/` (миграции), `.github/workflows/keepalive.yml`
- Modify: `package.json` (убрать `@supabase/supabase-js`), `.github/workflows/deploy.yml` (шаг «Env for the app» с двумя echo секретов), `src/vite-env.d.ts` (если объявлены `VITE_SUPABASE_*`), `README.md` (убрать упоминания Supabase, добавить «данные — в браузере»), lockfile (`npm install`)
- Create: `docs/этап-1-переезд.md` — инструкция владелицы

**Interfaces:**
- Consumes: ничего (чистое удаление).
- Produces: сборка без Supabase; инструкция владелице: (1) перенести районы руками в новом приложении, (2) удалить проект на supabase.com, (3) удалить секреты SUPABASE_URL/SUPABASE_ANON_KEY в настройках репозитория GitHub.

- [ ] **Step 1: Поиск оставшихся упоминаний**

Run: `npx grep -rn "supabase" src/ .github/ package.json` (или Grep-инструментом) — список файлов для правки.

- [ ] **Step 2: Удалить и почистить**

Удалить каталоги/файлы выше; из `deploy.yml` убрать шаг с секретами (и упоминание secrets.*); README: заменить блок про Supabase на абзац «хранилище — IndexedDB в браузере, синхронизация — в разработке». Инструкция `docs/этап-1-переезд.md` — три шага владелицы выше + оговорка «удаляй Supabase-проект только после того, как районы перенесены и проверены».

- [ ] **Step 3: Прогнать всё + build + проверить сборку CI-локально**

Run: `npm install && npm test && npm run build` → зелёное; повторный Grep «supabase» — пусто (кроме истории git и этого плана/спеки).

- [ ] **Step 4: Commit**

`chore: Supabase полностью удалён — приложение локальное`

### Task 6: Spike-страница проверки Яндекса (временная, без тестов)

**Files:**
- Create: `src/pages/SpikePage.tsx`
- Modify: `src/App.tsx` (маршрут `/spike`), `docs/этап-1-переезд.md` (шаги получения токена)

**Interfaces:**
- Consumes: нет (чистый fetch к `cloud-api.yandex.net`).
- Produces: страница `#/spike`: поле «вставь токен» + кнопка «проверить». Логика: `GET /v1/disk/resources?path=roaMark` (404 — норм, папки нет) → `POST .../resources?path=roaMark/spike.txt` (MkCol) → `GET .../resources/upload?path=roaMark/spike.txt&overwrite=true` → `PUT` байтов по выданному href → `GET .../resources/download?...` → `fetch` выданного href → сверить байты. Вердикт на экране: «✓ Яндекс подходит для синхронизации» / «✕ не пустило: <причина>» + какой шаг.

По дизайну это **spike**: тестов нет, страница удаляется в этапе 2 (или станет «проверить связь» в настройках). Токен живёт только в поле на время проверки (localStorage не трогаем).

- [ ] **Step 1: Написать страницу и маршрут** (как описано выше; стиль — палитра приложения, копия по-русски)

- [ ] **Step 2: Ручная проверка сборки**

Run: `npm run build` → чисто; `npm test` → зелёное (страница тестов не добавляет).

- [ ] **Step 3: Дополнить инструкцию владелицы**

В `docs/этап-1-переезд.md`: регистрация OAuth-приложения на oauth.yandex.ru (платформа «веб-сервисы», redirect `https://svetayet.github.io/roamark/`), ссылка-шаблон согласия (`response_type=token`, scope `cloud_api:disk.read cloud_api:disk.write`, подставить свой client_id), «после согласия скопируй токен из адресной строки и вставь на `#/spike`». Плюс честная оговорка: если Яндекс не выдаст токен таким способом — написать мне, найдём другой.

- [ ] **Step 4: Commit**

`spike: страница проверки байтового домена Яндекс.Диска`
