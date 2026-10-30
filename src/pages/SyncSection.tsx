import { useEffect, useState } from 'react';
import { useRepo } from '../data/RepoContext';
import { RelayClient, SyncError, syncErrorText } from '../data/sync/relay';
import { synchronize, type SyncRepo } from '../data/sync/sync';
import { buildAuthUrl, clearToken, getToken, hasToken } from '../data/sync/token';

/**
 * Раздел «Синхронизация»: подключение Яндекс.Диска (OAuth, токен только
 * в памяти вкладки), одна кнопка «синхронизироваться», метка последней
 * синхронизации и «проверить связь» (та самая кнопка после покупки хостинга).
 * Адрес реле — не секрет: хранится в localStorage, дефолт из ENV сборки.
 */

const RELAY_URL_KEY = 'roamark.relayUrl';
const LAST_SYNC = 'lastSyncAt';

function loadRelayUrl(): string {
  const envUrl = import.meta.env.VITE_RELAY_URL ?? '';
  return localStorage.getItem(RELAY_URL_KEY) ?? envUrl;
}

function humanTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export function SyncSection() {
  const repo = useRepo() as unknown as SyncRepo;
  const [connected, setConnected] = useState(hasToken());
  const [relayUrl, setRelayUrl] = useState(loadRelayUrl);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    void repo.getMeta<string>(LAST_SYNC).then(setLastSync);
  }, [repo]);

  const relay = () => new RelayClient(relayUrl.replace(/\/+$/, ''), getToken() ?? '');

  const connect = () => {
    window.location.href = buildAuthUrl();
  };

  const disconnect = () => {
    clearToken();
    setConnected(false);
    setSummary(null);
    setHint(null);
  };

  const check = async () => {
    setHint(null);
    setChecking(true);
    try {
      await relay().health();
      setHint('сервер жив');
    } catch (e) {
      setHint(syncErrorText(e));
    } finally {
      setChecking(false);
    }
  };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setHint(null);
    try {
      const report = await synchronize(repo, relay());
      setSummary(report.summary());
      setLastSync(await repo.getMeta<string>(LAST_SYNC));
    } catch (e) {
      setHint(syncErrorText(e));
      if (e instanceof SyncError && e.failure === 'token') setConnected(false);
    } finally {
      setBusy(false);
    }
  };

  const changeRelayUrl = (value: string) => {
    setRelayUrl(value);
    localStorage.setItem(RELAY_URL_KEY, value);
  };

  return (
    <section className="settings__section">
      <h2>Синхронизация</h2>

      {!connected ? (
        <>
          <p className="settings__hint">
            Треки лежат в этом браузере. Подключи Яндекс.Диск — на нём появится
            копия библиотеки, и она переедет на телефон. Токен живёт только
            в памяти вкладки и исчезает при закрытии.
          </p>
          <button className="btn" onClick={connect}>
            подключить Яндекс.Диск
          </button>
        </>
      ) : (
        <>
          <ul className="settings__districts">
            <li className="settings__district">
              <span className="settings__district-name">Яндекс.Диск · подключено</span>
              <button className="link link--danger" onClick={disconnect}>
                отключить
              </button>
            </li>
            <li className="settings__district">
              <span className="settings__district-name">
                {lastSync ? `последняя синхронизация: ${humanTime(lastSync)}` : 'ещё не синхронизировалось'}
              </span>
            </li>
          </ul>
          <div className="settings__new">
            <input
              aria-label="адрес сервера синхронизации"
              className="settings__new-name"
              placeholder="https://api.домен"
              value={relayUrl}
              onInput={(e) => changeRelayUrl((e.target as HTMLInputElement).value)}
            />
          </div>
          <p className="settings__hint">
            Адрес подставится сам после покупки домена — менять не нужно.
          </p>
          <div className="settings__new">
            <button className="btn" onClick={() => void run()} disabled={busy}>
              {busy ? 'синхронизируем…' : 'синхронизироваться'}
            </button>
            <button className="link" onClick={() => void check()} disabled={checking}>
              {checking ? 'проверяем…' : 'проверить связь'}
            </button>
          </div>
        </>
      )}

      {summary && <p className="settings__hint">{summary}</p>}
      {hint && <p className="settings__hint">{hint}</p>}
    </section>
  );
}
