import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Временная spike-страница (этап 1): проверяет, может ли браузер писать и читать
 * файлы в GitHub через Contents API — вся цепочка будущей синхронизации:
 * токен → репозиторий → залить файл → прочитать → скачать байты → удалить.
 * Яндекс.Диск уже проверен и отклонён: запись работает, чтение из браузера — нет.
 * Тестов нет, страница уходит в этапе 2. Токен живёт только в поле ввода.
 */

const API = 'https://api.github.com';
const REPO = 'svetayet/roamark';
const FILE = 'spike.txt';
// Не-ASCII внутри — проверяем честную передачу байтов, а не только код 200.
const PAYLOAD = 'roaMark spike: проверка связи 🌲 2026';

type Status = 'pending' | 'ok' | 'fail' | 'skip';

/** Строка → UTF-8 байты → base64 (так Contents API принимает содержимое). */
function toBase64(text: string): string {
  let binary = '';
  new TextEncoder().encode(text).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/** base64 из ответа API (с переносами строк) → строка. */
function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function SpikePage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<{ name: string; status: Status; note?: string }[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);

  function mark(index: number, status: Status, note?: string) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, status, ...(note ? { note } : {}) } : s)),
    );
  }

  async function run() {
    const value = token.trim();
    if (!value || running) return;
    const names = [
      'токен жив',
      'доступ к репозиторию',
      'залить файл',
      'прочитать файл (API)',
      'скачать сырыми байтами',
      'убрать за собой',
    ];
    setSteps(names.map((name) => ({ name, status: 'pending' })));
    setVerdict(null);
    setRunning(true);
    const auth = { Authorization: `Bearer ${value}`, Accept: 'application/vnd.github+json' };
    // Какой шаг пал — решаем по счётчику, состояние React из async не читаем.
    let cursor = 0;
    try {
      // 1. Токен: кто я.
      let res = await fetch(`${API}/user`, { headers: auth });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const me: { login: string } = await res.json();
      mark(0, 'ok', `@${me.login}`);
      cursor = 1;

      // 2. Репозиторий сайта виден токену.
      res = await fetch(`${API}/repos/${REPO}`, { headers: auth });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const repo: { private: boolean } = await res.json();
      mark(1, 'ok', repo.private ? 'репозиторий закрытый' : 'репозиторий публичный');
      cursor = 2;

      // 3. Заливаем: если файл уже лежит (прошлый оборванный запуск),
      //    обновление требует его sha.
      res = await fetch(`${API}/repos/${REPO}/contents/${FILE}`, { headers: auth });
      let sha: string | undefined;
      if (res.ok) {
        const existing: { sha: string } = await res.json();
        sha = existing.sha;
      }
      res = await fetch(`${API}/repos/${REPO}/contents/${FILE}`, {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'roaMark spike: проверка связи',
          content: toBase64(PAYLOAD),
          sha,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      mark(2, 'ok', sha ? 'файл обновлён' : 'файл создан');
      cursor = 3;

      // 4. Читаем через API и сверяем.
      res = await fetch(`${API}/repos/${REPO}/contents/${FILE}`, { headers: auth });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const file: { content: string; sha: string } = await res.json();
      if (fromBase64(file.content) !== PAYLOAD) throw new Error('прочитанное отличается от залитого');
      mark(3, 'ok');
      cursor = 4;

      // 5. Скачиваем сырыми байтами — так синхронизация будет забирать GPX.
      res = await fetch(`${API}/repos/${REPO}/contents/${FILE}`, {
        headers: { ...auth, Accept: 'application/vnd.github.raw' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = new TextDecoder().decode(await res.arrayBuffer());
      if (raw !== PAYLOAD) throw new Error('сырые байты отличаются от залитых');
      mark(4, 'ok');
      cursor = 5;

      // 6. Удаляем за собой — синхронизация тоже умеет удалять.
      res = await fetch(`${API}/repos/${REPO}/contents/${FILE}`, {
        method: 'DELETE',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'roaMark spike: уборка', sha: file.sha }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      mark(5, 'ok', 'в репозитории снова чисто');
      setVerdict('✓ GitHub подходит для синхронизации');
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      mark(cursor, 'fail', reason);
      setSteps((prev) => prev.map((s) => (s.status === 'pending' ? { ...s, status: 'skip' } : s)));
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
        <h1>проверка GitHub</h1>
      </header>

      <section className="settings__section">
        <h2>Токен</h2>
        <p className="settings__hint">
          Вставь токен GitHub (fine-grained, только для этого репозитория) — как его получить,
          написано в docs/этап-1-переезд.md. Токен остаётся только на этой странице и никуда не
          сохраняется.
        </p>
        <div className="settings__new">
          <input
            aria-label="токен GitHub"
            className="settings__new-name"
            placeholder="github_pat_…"
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
