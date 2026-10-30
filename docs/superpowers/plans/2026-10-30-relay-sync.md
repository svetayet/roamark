# Этап 2: реле-переводчик + синхронизация roaMark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** roaMark синхронизируется с Яндекс.Диском через тонкий stateless-реле на FastAPI; токен живёт только в памяти вкладки; слияние по-записное по датам; метка последней синхронизации хранится локально и на Диске.

**Architecture:** Бэкенд — FastAPI (~150 строк, `roamark-backend/`, git init): 5 операций из openapi.yaml, токен из Authorization перекладывается в заголовок Яндекса `OAuth`, байты и списки проходят насквозь, ничего не хранится. Фронт — ветка `sync-relay` репо RoaMark: записи IndexedDB получают даты и надгробия, манифест+слияние как чистые функции, RelayClient по контракту, OAuth implicit с перехватом токена до рендера, секция «Синхронизация» в настройках.

**Tech Stack:** FastAPI + httpx + pytest (бэкенд, Python 3.11+); Vite + React 19 + TS strict + Vitest (фронт, существующий).

**Spec:** `docs/superpowers/specs/2026-10-29-local-first-sync-design.md` (обновлён 2026-10-30), контракт: `../../../../../roamark-backend/openapi.yaml` (одобрен владелицей 2026-10-30 — источник правды, не меняем).

## Global Constraints

- Весь видимый текст — по-русски, обращение на «ты», женский род о себе.
- Токен Яндекса — только в памяти открытой вкладки; НИКОГДА в localStorage/IndexedDB/URL-истории (после перехвата фрагмент стирается).
- Никаких секретов в коде и репозитории; client_id OAuth — не секрет (публичный).
- openapi.yaml — источник правды; если коду нужны изменения контракта — сначала yaml, потом код.
- TS strict; тесты Vitest; полный suite зелёный; `npm run build` перед push.
- Коммиты: конец сообщения `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Реле: без БД, без файлов на диске, без состояния; CORS только для `https://svetayet.github.io` и `http://localhost:5173` (локальная разработка).
- Яндексу токен передаётся заголовком `Authorization: OAuth <token>` (не Bearer — внутренность реле, контракт наружу не меняется).

## Review Focus

1. **Не-ASCII байты через всю цепочку** (кириллица в GPX) — PUT и GET реле должны пройти байты без перекодировки: тест в Task 3 (`test_file_roundtrip_cyrillic_bytes`).
2. **401 посреди синхронизации** — ни одно полуприменённое состояние не остаётся видимым, UI просит «подключить заново»: тест в Task 9 (`test_sync_aborts_on_dead_token_after_apply` — применённый итог валиден, выкладывание не начато).
3. **Первый запуск: облако пусто/нет папки** — это не ошибка: Task 2 (`test_files_missing_folder_returns_empty`) и Task 9 (`test_sync_empty_cloud_pushes_everything`).
4. **Битый/чужой манифест** — честная ошибка «копия на Диске нечитаемая», локальное не трогаем: Task 6 (`test_parse_manifest_rejects_wrong_version`), Task 9 (`test_sync_stops_on_corrupt_manifest`).
5. **Пагинация списка Яндекса** (>1000 файлов не теряются, limit-цикл): Task 2 (`test_files_paginates_yandex_items`).

---

## Часть А — бэкенд (roamark-backend)

### Task 1: каркас реле — приложение, CORS, Authorization, /v1/health, git init

**Files:**
- Create: `roamark-backend/app/__init__.py`, `roamark-backend/app/main.py`, `roamark-backend/app/yandex.py`
- Create: `roamark-backend/requirements.txt`, `roamark-backend/tests/__init__.py`, `roamark-backend/tests/test_health.py`

**Interfaces:**
- Produces: ASGI-объект `app: FastAPI` в `app/main.py` (деплой Unit: module `app.main`, callable `app`); в `app/yandex.py` — `YANDEX_API = "https://cloud-api.yandex.net/v1/disk"` и класс `YandexError(Exception)` с полями `status: int, message: str`; в `main.py` — асинхронная зависимость `require_token(request) -> str` (Bearer из Authorization; нет/кривой → HTTPException 401 «Нужен токен Яндекса»).

- [ ] **Step 1: инициализировать репозиторий и зависимости**

`git init` в `roamark-backend/`; `requirements.txt`: `fastapi`, `uvicorn`, `httpx`, `pytest`. Установить в venv (`python -m venv .venv`). Проверить версию Python ≥ 3.11.

- [ ] **Step 2: проваливающийся тест**

`tests/test_health.py`:

```python
def test_health_ok(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    datetime.fromisoformat(r.json()["time"])  # время — настоящий ISO

def test_files_requires_token(client):
    r = client.get("/v1/files", params={"prefix": "tracks"})
    assert r.status_code == 401
    assert "message" in r.json()  # Error из yaml: {message}, не {detail}
```

`client` — фикстура conftest: `TestClient(app)`.

- [ ] **Step 3: запустить, убедиться в провале**

Run: `python -m pytest tests/ -v` — FAIL: нет модуля `app`.

- [ ] **Step 4: реализовать**

`app/main.py`: FastAPI; CORSMiddleware (origins из Global Constraints, все методы, заголовок Authorization); обработчик `StarletteHTTPException` → JSONResponse `{"message": detail}` (контракт Error); маршрут `/v1/health` → `{"status": "ok", "time": datetime.now(timezone.utc).isoformat()}`; зависимость `require_token`. `app/yandex.py`: константа + `YandexError`.

- [ ] **Step 5: зелёный прогон и коммит**

Run: `python -m pytest tests/ -v` — PASS 2/2. `.gitignore` (`.venv/`, `__pycache__/`). Commit: `feat: каркас реле — health, CORS, Authorization` + Co-Authored-By.

### Task 2: GET /v1/files — список файлов папки приложения

**Files:**
- Modify: `roamark-backend/app/yandex.py`, `roamark-backend/app/main.py`
- Test: `roamark-backend/tests/test_files.py` (+ conftest: фикстура подмены транспорта httpx на `httpx.MockTransport`)

**Interfaces:**
- Consumes: `require_token`, `YandexError` из Task 1.
- Produces: `async def yandex_list_files(token: str, prefix: str, transport=None) -> list[dict]` в `yandex.py` — элементы `{"name": str, "size": int, "modified": str}`; 404 от Яндекса (папки нет) → `[]`.

- [ ] **Step 1: проваливающиеся тесты**

```python
def test_files_maps_yandex_items(client, yandex): …
    # yandex мокает GET /v1/disk/resources → _embedded.items [{name,size,modified}]
    # assert r.json() == {"files": [{"name": "a.gpx", "size": 148, "modified": "2026-10-30T10:00:00+00:00"}]}
def test_files_missing_folder_returns_empty(client, yandex): …  # Яндекс 404 → {"files": []}
def test_files_paginates_yandex_items(client, yandex): …  # два ответа по limit → один список
def test_files_dead_token_maps_401(client, yandex): …     # Яндекс 401 → 401 {"message": …}
def test_files_yandex_500_maps_502(client, yandex): …     # → 502 {"message": "Яндекс вернул 500…"}
```

- [ ] **Step 2: провал** — `python -m pytest tests/test_files.py -v` (нет `/v1/files`).

- [ ] **Step 3: реализация**

`yandex.py`: `yandex_list_files` — цикл `GET {YANDEX_API}/resources?path=app:/{prefix}&limit=200&offset=n`, собирает `_embedded.items` пока страниц хватает; 404 → `[]`. Заголовок `Authorization: OAuth {token}`. Ошибки → `YandexError(status, message)`.
`main.py`: маршрут `/v1/files` → `{"files": await yandex_list_files(token, prefix)}`; `YandexError` → 401 если status в (401,403), иначе 502 (общий перехватчик для всех маршрутов — оформить как обработчик исключения).

- [ ] **Step 4: зелёный** — `python -m pytest tests/ -v` (все файлы, не только новый).

- [ ] **Step 5: Commit** — `feat: /v1/files — список файлов с пагинацией Яндекса`.

### Task 3: GET/PUT/DELETE /v1/file — байты насквозь

**Files:**
- Modify: `roamark-backend/app/yandex.py`, `roamark-backend/app/main.py`
- Test: `roamark-backend/tests/test_file.py`

**Interfaces:**
- Produces: `async def yandex_download(token, path, transport=None) -> bytes`; `async def yandex_upload(token, path, data: bytes, transport=None) -> None`; `async def yandex_delete(token, path, transport=None) -> None` (404 → молча успех).

- [ ] **Step 1: проваливающиеся тесты**

```python
def test_file_roundtrip_cyrillic_bytes(client, yandex): …
    # PUT /v1/file?path=tracks/хибины.gpx c байтами "лес🌲".encode() → 204
    # мок сохраняет байты; GET тем же путём → 200, тело ровно те же байты, content-type octet-stream
def test_file_get_missing_maps_404(client, yandex): …
def test_file_delete_missing_is_success(client, yandex): …  # 204 и когда Яндекс 404
def test_file_put_uses_upload_href_and_overwrite(client, yandex): …
    # мок требует, чтобы upload-ссылка запрашивалась с overwrite=true и байты ушли на href
```

- [ ] **Step 2: провал.** **Step 3: реализация**

`yandex_download`: `GET resources/download?path=app:/{path}` → `href` → `GET href` (токен не нужен, домен чужой) → байты. `yandex_upload`: `GET resources/upload?path=…&overwrite=true` → `PUT href content=data`. `yandex_delete`: `DELETE resources?path=…`. `main.py`: три маршрута; GET → `Response(content, media_type="application/octet-stream")`; PUT читает `await request.body()` → 204; DELETE → 204. 404 Яндекса на download → HTTP 404 «такого файла нет на Диске».

- [ ] **Step 4: зелёный suite.** **Step 5: Commit** — `feat: /v1/file — скачивание, заливка, удаление байт в байт`.

### Task 4: README реле — запуск и деплой на masterhost

**Files:**
- Modify: `roamark-backend/README.md` (раздел «Дорожная карта» → «Как запустить и задеплоить»)

- [ ] **Step 1:** дописать разделы: локальный запуск (`python -m venv`, `pip install -r requirements.txt`, `python -m pytest`, `uvicorn app.main:app --reload`), деплой на masterhost «Хостинг приложений» (NGINX Unit: module `app.main`, callable `app`; файлы приложения + requirements; SSL панели; адрес вписать в openapi.yaml и VITE_RELAY_URL).
- [ ] **Step 2:** проверка человеком невозможна до покупки хостинга — вместо неё сверка с ответом техподдержки masterhost (модуль + callable, без Dockerfile) — текст README не обещает большего.
- [ ] **Step 3: Commit** — `docs: запуск и деплой реле на masterhost`.

---

## Часть B — фронт (RoaMark, ветка `sync-relay`)

### Task 5: даты, надгробия и стор meta в LocalTrackRepository (IndexedDB v2)

**Files:**
- Modify: `src/data/local/repository.ts`, `src/data/local/idb.ts` (если нужен стор meta — создать в upgrade)
- Test: `src/data/local/repository.test.ts` (дополнить)

**Interfaces:**
- Produces (типы записей, наружу не торчат): `TrackRecord = {kind:'track'} & Track & {updatedAt: string; deletedAt: string | null}`; `DistrictRecord` — аналогично.
- Produces (публичные методы LocalTrackRepository для синка):

```ts
listAllRecords(): Promise<SyncRecord[]>            // включая надгробия; старые записи без updatedAt нормализуются в updatedAt ?? createdAt
replaceRecords(records: SyncRecord[]): Promise<void> // итог слияния записывается целиком
getGpxBytes(id: string): Promise<ArrayBuffer | null>
putGpxBytes(id: string, bytes: ArrayBuffer): Promise<void>
getMeta<T>(key: string): Promise<T | null>
setMeta(key: string, value: unknown): Promise<void>
```

`SyncRecord` вводится в Task 6 — здесь импортировать нельзя (Task 6 позже), поэтому в этом таске тип-заглушка локально совпадающий: `{id: string; kind: 'district'|'track'; updatedAt: string; deletedAt: string | null} & Record<string, unknown>`; Task 6 закрепит общий тип в `src/data/sync/manifest.ts` и repository.ts переключится на него (совместимо структурно).

**Правила:** любое изменение записи → `updatedAt = new Date().toISOString()`; удаление трека/пустого района → надгробие (`deletedAt`), gpx-байты трека стираются сразу; списки и getTrack надгробий не видят; `replaceRecords` пишет записи как есть (даты не трогает). Версия базы 1→2, в upgrade — стор `meta` (keyPath 'id', записи `{id: string; value: unknown}`).

- [ ] **Step 1: проваливающиеся тесты** (каждое имя — отдельный test):

`удалённый трек исчезает из списка и getTrack, но живёт в listAllRecords как надгробие`; `updateTrackMeta обновляет updatedAt`; `listAllRecords нормализует запись без updatedAt (берёт createdAt)`; `meta-стор читает и пишет`; `replaceRecords переписывает набор записей целиком`; `надгробие пустого района` (deleteDistrict → запись жива в listAllRecords). Памятка: тесты используют `fake-indexeddb` как существующие.

- [ ] **Step 2: провал** — `npx vitest run src/data/local/repository.test.ts`.
- [ ] **Step 3: реализация** по правилам выше; версия openDb → 2.
- [ ] **Step 4: зелёный весь suite** — `npx vitest run`.
- [ ] **Step 5: Commit** — `feat: даты, надгробия и meta-стор в локальной базе (v2)`.

### Task 6: манифест и по-записное слияние (чистые функции)

**Files:**
- Create: `src/data/sync/manifest.ts`, `src/data/sync/merge.ts`
- Test: `src/data/sync/merge.test.ts`

**Interfaces:**
- Produces (`manifest.ts`):

```ts
export interface SyncRecord { id: string; kind: 'district' | 'track'; updatedAt: string; deletedAt: string | null; [k: string]: unknown }
export interface Manifest { version: 1; syncedAt: string; records: SyncRecord[] }
export function buildManifest(records: SyncRecord[], syncedAt: string): Manifest
export type ParsedManifest = { ok: true; manifest: Manifest } | { ok: false; reason: string }
export function parseManifest(text: string): ParsedManifest  // версия не 1 / не JSON / не массив → ok:false с русской причиной
```

- Produces (`merge.ts`):

```ts
export interface MergeReport { taken: number; pushed: number; conflicts: { id: string; winner: 'local' | 'cloud' }[] }
export function mergeRecords(local: SyncRecord[], cloud: SyncRecord[]): { merged: SyncRecord[]; report: MergeReport }
```

Правила слияния (спека): ключ `id`; эффективная дата `deletedAt ?? updatedAt`; побеждает большая дата; при равенстве — побеждает лексикографически больший канонический JSON записи (`JSON.stringify` с отсортированными ключами); запись только с одной стороны остаётся (taken/pushed); после слияния — воскресение районов-сирот (живой трек ссылается на absent/deleted район → район возвращается `deletedAt: null`) и инвариант основного района (ровно один `isPrimary` — самый свежий из победивших с `isPrimary`, иначе самый свежий район).

- [ ] **Step 1: проваливающиеся тесты:** `новая локальная запись остаётся (pushed)`; `новая облачная забирается (taken)`; `облачная новее — побеждает облако`; `правка новее удаления — запись воскресает`; `тай-брейк по каноническому JSON симметричен` (merge(l,c).merged === merge(c,l).merged как множества); `сирота: трек возвращает удалённый район`; `основной район ровно один`; `parseManifest отвергает чужую версию`; `parseManifest читает свою запись`.
- [ ] **Step 2: провал.** **Step 3: реализация.** **Step 4: весь suite зелёный.**
- [ ] **Step 5: Commit** — `feat: манифест и по-записное слияние по датам`.

### Task 7: RelayClient — клиент переводчика по openapi.yaml

**Files:**
- Create: `src/data/sync/relay.ts`
- Test: `src/data/sync/relay.test.ts`

**Interfaces:**
- Produces:

```ts
export type SyncFailure = 'token' | 'missing' | 'relay' | 'network'
export class SyncError extends Error { readonly failure: SyncFailure }
export class RelayClient {
  constructor(baseUrl: string, token: string, fetchImpl: typeof fetch = fetch)
  async health(): Promise<{ status: string; time: string }>
  async listFiles(prefix: string): Promise<{ name: string; size: number; modified: string }[]>
  async getFile(path: string): Promise<ArrayBuffer>
  async putFile(path: string, bytes: ArrayBuffer): Promise<void>
  async deleteFile(path: string): Promise<void>
}
```

Правила: заголовок `Authorization: Bearer <token>` на всём, кроме health; HTTP 401 → SyncError 'token'; 404 на getFile → 'missing'; любой другой статус/битый JSON → 'relay' (сообщение сервера из `message`, по-русски); сеть упала → 'network'; `cache: 'no-store'` (урок этапа 1: ответы кэшируются).

- [ ] **Step 1: проваливающиеся тесты:** `health проходит без токена`; `listFiles маппит files`; `401 → failure token`; `502 с message → failure relay и русский текст`; `сетевой отказ → network`; `putFile отправляет байты и Authorization`. fetch мокается через injected fetchImpl (без библиотек).
- [ ] **Step 2: провал.** **Step 3: реализация.** **Step 4: весь suite зелёный.**
- [ ] **Step 5: Commit** — `feat: клиент реле по openapi-контракту`.

### Task 8: OAuth-токен в памяти вкладки

**Files:**
- Create: `src/data/sync/token.ts`
- Modify: `src/main.tsx`
- Test: `src/data/sync/token.test.ts`

**Interfaces:**
- Produces:

```ts
export const YA_CLIENT_ID = '4be515d1418c48c0bb50fbd1424bd63e'
export function buildAuthUrl(): string   // oauth.yandex.ru/authorize: response_type=token, client_id, redirect_uri=сайт, scope=cloud_api:disk.app_folder
export function captureTokenFromLocation(): void  // вызывается в main.tsx ДО рендера: #access_token=… → память, фрагмент адреса стирается
export function hasToken(): boolean
export function getToken(): string | null
export function clearToken(): void
```

Токен — переменная модуля; никакие вызовы записи в хранилища. main.tsx: вызов `captureTokenFromLocation()` первой строкой до `createRoot`.

- [ ] **Step 1: проваливающиеся тесты:** `buildAuthUrl содержит client_id, scope, redirect_uri, response_type=token`; `capture забирает access_token из hash и стирает фрагмент` (jsdom: `window.location.hash`, затем `history.replaceState` виден в `location.href`); `getToken после capture отдаёт токен, после clearToken — null`; `повторный capture без фрагмента не меняет токен`.
- [ ] **Step 2: провал.** **Step 3: реализация (перехват — доработка spikeToken из истории этапа 1).** **Step 4: весь suite зелёный.**
- [ ] **Step 5: Commit** — `feat: OAuth Яндекса — токен только в памяти вкладки`.

### Task 9: оркестратор синхронизации

**Files:**
- Create: `src/data/sync/sync.ts`
- Test: `src/data/sync/sync.test.ts`

**Interfaces:**
- Consumes: `LocalTrackRepository`-методы Task 5 (`listAllRecords`, `replaceRecords`, `getGpxBytes`, `putGpxBytes`, `getMeta`, `setMeta`), `RelayClient` Task 7, `buildManifest/parseManifest/mergeRecords` Task 6. В тестах — узкий интерфейс:

```ts
export interface SyncRepo {  // всё, что нужно оркестратору от хранилища
  listAllRecords(): Promise<SyncRecord[]>
  replaceRecords(records: SyncRecord[]): Promise<void>
  getGpxBytes(id: string): Promise<ArrayBuffer | null>
  putGpxBytes(id: string, bytes: ArrayBuffer): Promise<void>
  getMeta<T>(key: string): Promise<T | null>
  setMeta(key: string, value: unknown): Promise<void>
}
```

- Produces:

```ts
export interface SyncReport { taken: number; pushed: number; filesUp: number; filesDown: number; conflicts: number; syncedAt: string; summary(): string }  // summary: «синхронизировано · забрано 2, выложено 5» по-русски
export async function synchronize(repo: SyncRepo, relay: RelayClient): Promise<SyncReport>
export function readFileManifest(relay: RelayClient): Promise<Manifest | null>  // null = на Диске манифеста ещё нет
```

Порядок шагов (идемпотентность: прервалась — повтор кнопки даёт тот же итог):
1. `readFileManifest` (битый манифест → SyncError 'relay' с причиной «копия на Диске нечитаемая»; нет манифеста → пустое облако `records: []`).
2. Fast-path: `manifest.syncedAt === (await repo.getMeta<string>('lastSyncAt'))` и нет локальных записей с датой > lastSyncAt → отчёт «всё совпадает» без сети, кроме чтения манифеста.
3. `mergeRecords(local, cloud)` → `replaceRecords(merged)`.
4. Забрать байты: живые треки из `taken`, у которых локально нет gpx → `getFile('tracks/<id>.gpx')` → `putGpxBytes`; 'missing' файл → запись остаётся, отчёт не врёт (файл недоступен — трек без файла, увидим в UI как ошибку трека; зафиксировать в summary «файл не найден на Диске: N»).
5. `listFiles('tracks')` → выложить gpx живых треков, которых нет в списке; удалить облачные файлы треков-надгробий.
6. `putFile('manifest.json', buildManifest(merged, now))`, `setMeta('lastSyncAt', now)`.

- [ ] **Step 1: проваливающиеся тесты:** `пустое облако — всё выложено (filesUp = числу живых треков, манифест записан, lastSyncAt сохранён)`; `облачный трек забран вместе с байтами (filesDown=1, putGpxBytes вызван)`; `конфликт дат — победило свежее, конфликт в отчёте`; `надгробие — файл удалён с Диска`; `битый манифест — SyncError, replaceRecords не вызывался`; `401 на manifest — SyncError token, ничего не применено`; `fast-path: syncedAt равен lastSyncAt — сетевых вызовов кроме manifest нет`; `summary по-русски содержит «синхронизировано»`.
- [ ] **Step 2: провал.** **Step 3: реализация.** **Step 4: весь suite зелёный.**
- [ ] **Step 5: Commit** — `feat: оркестратор синхронизации — слияние, байты, метки`.

### Task 10: секция «Синхронизация» в настройках + чистка этапа 1

**Files:**
- Create: `src/pages/SyncSection.tsx`
- Modify: `src/pages/SettingsPage.tsx` (вставить секцию), `src/styles/settings.css` (если существующих классов не хватает)
- Delete: `src/pages/SpikePage.tsx`, `docs/этап-1-переезд.md`, `spike.txt`
- Modify: `src/App.tsx` (роут /spike убрать), `README.md` (раздел про синхронизацию переписать: реле вместо GitHub)
- Test: `src/pages/SyncSection.test.tsx`; проверить `src/pages/SettingsPage.test.tsx` не сломался

**Interfaces:**
- Consumes: `synchronize`, `RelayClient`, `hasToken/getToken/clearToken/buildAuthUrl` (Task 7–9), `useRepo()` из существующего RepoContext (приведение к `SyncRepo` — LocalTrackRepository им удовлетворяет структурно).
- Produces: `<SyncSection />` — самодостаточная секция настроек.

Состояния UI (текст по-русски, палитра «ель», существующие классы `settings__*`):
- токена нет: абзац «Треки лежат в этом браузере. Подключи Яндекс.Диск — появится копия.» + кнопка «подключить Яндекс.Диск» (переход по `buildAuthUrl()`, `window.location.href`).
- токен есть: строка «Яндекс.Диск · подключено», кнопки «синхронизироваться» (занятость: «синхронизируем…») и «отключить» (clearToken); после — сводка `report.summary()`; строка «последняя синхронизация: <дата по-человечески>» из `getMeta('lastSyncAt')`.
- «проверить связь» — `relay.health()` → «сервер жив» или текст ошибки (это и есть кнопка из плана покупки хостинга).
- адрес реле: input, localStorage `roamark.relayUrl`, дефолт `import.meta.env.VITE_RELAY_URL ?? ''`, подпись «заполнится после покупки домена, менять не нужно».
- ошибки: SyncError 'token' → «Сессия Яндекса истекла — подключи заново»; 'network' → «Сервер недоступен — проверь связь или адрес»; прочее — сообщение.

- [ ] **Step 1: проваливающиеся тесты SyncSection:** `без токена — кнопка «подключить Яндекс.Диск» и переход по buildAuthUrl`; `с токеном — «синхронизироваться» вызывает synchronize и показывает сводку`; `сводка «забрано 1, выложено 2» отражает отчёт`; `401 → «Сессия Яндекса истекла»`; `последняя синхронизация отображается из meta`. (моки модулей sync-функций через vi.mock; fetch не трогаем).
- [ ] **Step 2: провал.**
- [ ] **Step 3: реализация + чистка** (SpikePage/роут/docs/spike.txt/README).
- [ ] **Step 4: весь suite зелёный + `npm run build`.**
- [ ] **Step 5: Commit** — `feat: раздел «Синхронизация» — кнопка, сводка, проверка связи; чистка этапа 1`.

---

## Финал ветки

- Оба репо: полный suite зелёный, `npm run build` зелёной сборкой.
- Ревью всей ветки (`superpowers:requesting-code-review`), затем `superpowers:finishing-a-development-branch`.
- Владелице: инструкция «что нажать после покупки хостинга» (вписать адрес, «подключить», «проверить связь», «синхронизироваться» с телефона).
