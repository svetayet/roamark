import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';
import { RepositoryError, type District } from '../data/repository';
import { useTheme, type ThemePref } from '../theme/theme';

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'светлая' },
  { value: 'dark', label: 'тёмная' },
  { value: 'system', label: 'системная' },
];

/** Настройки: тема, районы, выход. */
export function SettingsPage() {
  const repo = useRepo();
  const { pref, setPref } = useTheme();
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<District[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);

  const reload = () => repo.listDistricts().then(setDistricts);
  useEffect(() => {
    void reload();
  }, [repo]);

  const makePrimary = async (id: string) => {
    setHint(null);
    await repo.setPrimaryDistrict(id);
    await reload();
  };

  const remove = async (id: string) => {
    setHint(null);
    try {
      await repo.deleteDistrict(id);
      await reload();
    } catch (e) {
      if (e instanceof RepositoryError) setHint(e.message);
    }
  };

  const rename = async (id: string) => {
    if (!editing || editing.id !== id || !editing.draft.trim()) return;
    await repo.renameDistrict(id, editing.draft);
    setEditing(null);
    await reload();
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
          {districts.map((d) => (
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
                    {d.isPrimary ? '⌂ ' : ''}
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
        {hint && <p className="settings__hint">сначала перенесите треки: {hint}</p>}
      </section>

      <button className="link link--danger settings__logout" onClick={logout}>
        выйти
      </button>
    </div>
  );
}
