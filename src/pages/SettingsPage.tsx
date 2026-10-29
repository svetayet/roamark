import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';
import { RepositoryError, type District } from '../data/repository';
import { orderDistricts } from '../logic/districts';
import { useTheme, type ThemePref } from '../theme/theme';

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'светлая' },
  { value: 'dark', label: 'тёмная' },
  { value: 'system', label: 'системная' },
];

/** Текст ошибки для подсказки: доменные ошибки репозитория говорят сами, прочие — общая фраза. */
function hintOf(e: unknown): string {
  if (e instanceof RepositoryError) return e.message;
  return 'Не получилось. Попробуй ещё раз.';
}

/** Настройки: тема, районы, выход. */
export function SettingsPage() {
  const repo = useRepo();
  const { pref, setPref } = useTheme();
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<District[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [newName, setNewName] = useState('');

  const reload = () => repo.listDistricts().then(setDistricts);
  useEffect(() => {
    void reload();
  }, [repo]);

  const makePrimary = async (id: string) => {
    setHint(null);
    try {
      await repo.setPrimaryDistrict(id);
      await reload();
    } catch (e) {
      setHint(hintOf(e));
    }
  };

  const remove = async (id: string) => {
    setHint(null);
    try {
      await repo.deleteDistrict(id);
      await reload();
    } catch (e) {
      setHint(hintOf(e));
    }
  };

  const rename = async (id: string) => {
    if (!editing || editing.id !== id || !editing.draft.trim()) return;
    try {
      await repo.renameDistrict(id, editing.draft);
      setEditing(null);
      await reload();
    } catch (e) {
      setHint(hintOf(e));
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setHint(null);
    try {
      await repo.createDistrict(name);
      setNewName('');
      await reload();
    } catch (e) {
      setHint(hintOf(e));
    }
  };

  const logout = async () => {
    await repo.signOut();
    navigate('/login');
  };

  return (
    <div className="page">
      <header className="page__header">
        <button className="link" onClick={() => navigate('/')}>
          ← все треки
        </button>
        <h1>настройки</h1>
      </header>

      <section className="settings__section">
        <h2>Тема</h2>
        <div className="field__radios">
          {THEME_OPTIONS.map((t) => (
            <label key={t.value} className="radio">
              <input
                type="radio"
                name="theme"
                checked={pref === t.value}
                onChange={() => setPref(t.value)}
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings__section">
        <h2>Районы</h2>
        <ul className="settings__districts">
          {orderDistricts(districts).map((d) => (
            <li key={d.id} className="settings__district">
              {editing?.id === d.id ? (
                <>
                  <input
                    aria-label="имя района"
                    className="settings__rename"
                    value={editing.draft}
                    onInput={(e) =>
                      setEditing({
                        id: d.id,
                        draft: (e.target as HTMLInputElement).value,
                      })
                    }
                  />
                  <button className="btn" onClick={() => rename(d.id)}>
                    готово
                  </button>
                  <button className="btn" onClick={() => setEditing(null)}>
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <span className="settings__district-name">
                    {d.isPrimary ? '★ ' : ''}
                    {d.name}
                  </span>
                  {!d.isPrimary && (
                    <button className="link" onClick={() => makePrimary(d.id)}>
                      сделать основным
                    </button>
                  )}
                  <button className="link" onClick={() => setEditing({ id: d.id, draft: d.name })}>
                    переименовать
                  </button>
                  <button className="link link--danger" onClick={() => remove(d.id)}>
                    удалить
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="settings__new">
          <input
            aria-label="имя нового района"
            className="settings__new-name"
            placeholder="новый район"
            value={newName}
            onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
          />
          <button className="btn" onClick={create} disabled={!newName.trim()}>
            добавить
          </button>
        </div>
        {hint && <p className="settings__hint">{hint}</p>}
      </section>

      <button className="link link--danger settings__logout" onClick={logout}>
        выйти
      </button>
    </div>
  );
}
