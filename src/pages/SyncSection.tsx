import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRepo } from '../data/RepoContext';
import type { SyncRepo } from '../data/sync/sync';
import {
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
 * Раздел «Синхронизация»: подключение Яндекс.Диска и метка последней
 * синхронизации; запуск — значком рядом с ней, как в шапке (общий движок
 * runner.ts). Отчёт «сколько куда» виден только здесь: шапочный запуск молчит.
 * Адрес реле — не секрет: дефолт из ENV сборки, поля для него в интерфейсе нет.
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
  const [lastSync, setLastSync] = useState<string | null>(null);

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
            <button
              className={`app-header__btn${runner.busy ? ' app-header__btn--busy' : ''}`}
              onClick={() => startSync('settings', repo, defaultRelayUrl())}
              aria-label="синхронизировать"
              title="синхронизировать"
              disabled={runner.busy}
            >
              <SyncIcon />
            </button>
          </li>
        </ul>
      )}

      {runner.report && <p className="settings__hint">{runner.report}</p>}
      {runner.error && <p className="settings__hint">{runner.error}</p>}
    </section>
  );
}
