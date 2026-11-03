import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRepo } from '../data/RepoContext';
import { RelayClient, syncErrorText } from '../data/sync/relay';
import type { SyncRepo } from '../data/sync/sync';
import {
  RELAY_URL_KEY,
  clearOutcome,
  defaultRelayUrl,
  getRunnerState,
  startConnect,
  startSync,
  subscribeRunner,
} from '../data/sync/runner';
import { disconnect, isConnected } from '../data/sync/token';
import { SyncIcon } from '../components/icons';

/**
 * Раздел «Синхронизация»: подключение Яндекс.Диска, одна кнопка
 * «синхронизироваться», метка последней синхронизации и «проверить связь».
 * Сам запуск — общий с шапкой движок runner.ts: токен в память вкладки
 * приносится тихим заходом на oauth при каждом запуске, в localStorage
 * живёт только факт подключения. Адрес реле — не секрет: localStorage,
 * дефолт из ENV сборки.
 */

const LAST_SYNC = 'lastSyncAt';

function humanTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export function SyncSection() {
  const repo = useRepo() as unknown as SyncRepo;
  const runner = useSyncExternalStore(subscribeRunner, getRunnerState);
  const [connected, setConnected] = useState(isConnected);
  const [relayUrl, setRelayUrl] = useState(defaultRelayUrl);
  const [checking, setChecking] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Метка последней синхронизации: на монтировании и после каждой завершённой синхронизации.
  useEffect(() => {
    if (runner.busy) return;
    void repo.getMeta<string>(LAST_SYNC).then(setLastSync);
  }, [repo, runner.busy]);

  const connect = () => {
    // Маркер «настройки ждут» + тихий уход на oauth; после возврата runner продолжит.
    startConnect();
  };

  const disconnectAll = () => {
    disconnect();
    clearOutcome();
    setConnected(false);
    setHint(null);
  };

  const check = async () => {
    setHint(null);
    setChecking(true);
    try {
      await new RelayClient(relayUrl.replace(/\/+$/, ''), '').health();
      setHint('сервер жив');
    } catch (e) {
      setHint(syncErrorText(e));
    } finally {
      setChecking(false);
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
              <button className="link link--danger" onClick={disconnectAll}>
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
              name="relay-url"
              className="settings__new-name"
              placeholder="https://api.домен"
              value={relayUrl}
              onInput={(e) => changeRelayUrl((e.target as HTMLInputElement).value)}
            />
          </div>
          <p className="settings__hint">
            Адрес сервера уже вписан — менять не нужно.
          </p>
          <div className="settings__new">
            <button className="btn" onClick={() => startSync('settings', repo, relayUrl)} disabled={runner.busy}>
              {runner.busy && (
                <span className="btn__spinner" aria-hidden="true">
                  <SyncIcon size={14} />
                </span>
              )}
              {runner.busy ? 'синхронизируем…' : 'синхронизироваться'}
            </button>
            <button className="link" onClick={() => void check()} disabled={checking}>
              {checking ? 'проверяем…' : 'проверить связь'}
            </button>
          </div>
        </>
      )}

      {runner.report && <p className="settings__hint">{runner.report}</p>}
      {runner.error && <p className="settings__hint">{runner.error}</p>}
      {hint && <p className="settings__hint">{hint}</p>}
    </section>
  );
}
