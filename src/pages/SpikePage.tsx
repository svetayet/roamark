import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { takeCapturedToken } from './spikeToken';

/**
 * Временная spike-страница (этап 1): проверяет, отдаёт ли Яндекс.Диск
 * файлы прямо в браузер с github.io — вся цепочка будущей синхронизации:
 * папка → загрузка файла → скачивание → сверка байтов.
 * Тестов нет, страница уходит в этапе 2. Токен живёт только в поле ввода.
 */

const API = 'https://cloud-api.yandex.net/v1/disk';
const FOLDER = 'roaMark';
const FILE = 'roaMark/spike.txt';
// Не-ASCII внутри — проверяем честную передачу байтов, а не только код 200.
const PAYLOAD = 'roaMark spike: проверка связи 🌲 2026';

type Status = 'pending' | 'ok' | 'fail' | 'skip';

export function SpikePage() {
  const navigate = useNavigate();
  // Если пришли с согласия Яндекса — токен уже перехвачен из адреса.
  const [token, setToken] = useState(() => takeCapturedToken() ?? '');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<{ name: string; status: Status; note?: string }[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);

  async function run() {
    const value = token.trim();
    if (!value || running) return;
    const names = [
      'папка roaMark на Диске',
      'ссылка на загрузку',
      'залить файл',
      'ссылка на скачивание',
      'скачать и сверить байты',
    ];
    setSteps(names.map((name) => ({ name, status: 'pending' })));
    setVerdict(null);
    setRunning(true);
    const auth = { Authorization: `OAuth ${value}` };
    // Какой шаг пал — решаем по счётчику, состояние React из async не читаем.
    let cursor = 0;
    try {
      // 1. Папка: 404 — нормально, значит создадим (PUT = WebDAV MkCol).
      let res = await fetch(`${API}/resources?path=${encodeURIComponent(FOLDER)}`, {
        headers: auth,
      });
      if (res.status === 404) {
        res = await fetch(`${API}/resources?path=${encodeURIComponent(FOLDER)}`, {
          method: 'PUT',
          headers: auth,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setSteps((prev) => prev.map((s, i) => (i === 0 ? { ...s, status: 'ok' } : s)));
      cursor = 1;

      // 2. Ссылка на загрузку.
      res = await fetch(
        `${API}/resources/upload?path=${encodeURIComponent(FILE)}&overwrite=true`,
        { headers: auth },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { href: uploadHref }: { href: string } = await res.json();
      setSteps((prev) => prev.map((s, i) => (i === 1 ? { ...s, status: 'ok' } : s)));
      cursor = 2;

      // 3. Заливаем байты по выданной ссылке (домен downloader — здесь
      //    и решается главный вопрос CORS).
      res = await fetch(uploadHref, { method: 'PUT', body: PAYLOAD });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSteps((prev) => prev.map((s, i) => (i === 2 ? { ...s, status: 'ok' } : s)));
      cursor = 3;

      // 4. Ссылка на скачивание.
      res = await fetch(`${API}/resources/download?path=${encodeURIComponent(FILE)}`, {
        headers: auth,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { href: downloadHref }: { href: string } = await res.json();
      setSteps((prev) => prev.map((s, i) => (i === 3 ? { ...s, status: 'ok' } : s)));
      cursor = 4;

      // 5. Скачиваем тем же браузером и сверяем байт-в-байт. Свежевыписанная
      //    ссылка первые секунды отдаёт ошибку без CORS-заголовка (по логам
      //    браузера это 403 или «Failed to fetch»), а потом «дозревает» —
      //    та же ссылка качается свободно. Пробуем несколько раз с паузой.
      let text: string | null = null;
      let lastReason = '';
      let attemptCount = 0;
      for (let attempt = 1; attempt <= 6; attempt++) {
        attemptCount = attempt;
        try {
          res = await fetch(downloadHref);
          if (res.ok) {
            text = new TextDecoder().decode(await res.arrayBuffer());
            break;
          }
          lastReason = `HTTP ${res.status}`;
        } catch (e) {
          lastReason = e instanceof Error ? e.message : String(e);
        }
        if (attempt < 6) {
          setSteps((prev) =>
            prev.map((s, i) =>
              i === 4
                ? { ...s, note: `попытка ${attempt} не вышла (${lastReason}), ждём 5 с…` }
                : s,
            ),
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
      if (text === null) throw new Error(lastReason || 'скачать не удалось');
      if (text !== PAYLOAD) throw new Error('скачанное отличается от залитого');
      setSteps((prev) =>
        prev.map((s, i) =>
          i === 4
            ? {
                ...s,
                status: 'ok',
                ...(attemptCount > 1 ? { note: `получилось с попытки ${attemptCount}` } : {}),
              }
            : s,
        ),
      );
      setVerdict('✓ Яндекс подходит для синхронизации');
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      setSteps((prev) =>
        prev.map((s, i) =>
          i === cursor
            ? { ...s, status: 'fail', note: reason }
            : s.status === 'pending'
              ? { ...s, status: 'skip' }
              : s,
        ),
      );
      setVerdict(`✕ не пустило на шаге «${names[cursor]}»: ${reason}`);
    } finally {
      setRunning(false);
    }
  }

  const icon: Record<Status, string> = { pending: '…', ok: '✓', fail: '✕', skip: '—' };

  return (
    <div className="page">
      <header className="page__header">
        <button className="link" onClick={() => navigate('/')}>
          ← все треки
        </button>
        <h1>проверка Яндекса</h1>
      </header>

      <section className="settings__section">
        <h2>Токен</h2>
        <p className="settings__hint">
          Вставь токен Яндекс.Диска — как его получить, написано в docs/этап-1-переезд.md.
          Токен остаётся только на этой странице и никуда не сохраняется.
        </p>
        <div className="settings__new">
          <input
            aria-label="токен Яндекс.Диска"
            className="settings__new-name"
            placeholder="y0_AgAAAA…"
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          />
          <button className="btn" onClick={() => void run()} disabled={running || !token.trim()}>
            {running ? 'проверяем…' : 'проверить'}
          </button>
        </div>
      </section>

      {steps.length > 0 && (
        <section className="settings__section">
          <h2>Шаги</h2>
          <ul className="settings__districts">
            {steps.map((s) => (
              <li key={s.name} className="settings__district">
                <span className="settings__district-name">
                  {icon[s.status]} {s.name}
                  {s.note ? ` — ${s.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {verdict && <p className="settings__hint">{verdict}</p>}
    </div>
  );
}
