import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';
import type { District, Track } from '../data/repository';
import { TrackCard } from '../components/TrackCard';
import { Brand } from '../components/Brand';
import { orderDistricts } from '../logic/districts';
import { withRetry } from '../logic/retry';
import { readSelectedDistrict, writeSelectedDistrict } from './sessionDistrict';
import { readCachedDistricts, writeCachedDistricts, readCachedTracks, writeCachedTracks } from './homeCache';

/** Главная: шапка с селектом районов, кнопка «+», список треков основного экрана. */
export function HomePage() {
  const repo = useRepo();
  const navigate = useNavigate();
  // Кэш рисует экран до ответа сервера; «загружаем…» остаётся только без кэша.
  const [districts, setDistricts] = useState<District[]>(() => readCachedDistricts() ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelectedDistrict());
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(() => readCachedDistricts() === null);
  const [tracksLoading, setTracksLoading] = useState(true);
  // Упавшая загрузка не должна висеть вечным «загружаем…»: показываем ошибку
  // и даём повторить одним нажатием.
  const [loadFailed, setLoadFailed] = useState(false);
  const [tracksFailed, setTracksFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    withRetry(() => repo.listDistricts())
      .then((list) => {
        if (!live) return;
        setDistricts(list);
        writeCachedDistricts(list);
        setSelectedId((current) => {
          if (current && list.some((d) => d.id === current)) return current;
          return (list.find((d) => d.isPrimary) ?? list[0])?.id ?? null;
        });
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setLoading(false);
        setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, [repo, reloadKey]);

  useEffect(() => {
    if (!selectedId) {
      setTracks([]);
      setTracksLoading(false);
      setTracksFailed(false);
      return;
    }
    const cached = readCachedTracks(selectedId);
    setTracks(cached ?? []);
    setTracksLoading(cached === null);
    setTracksFailed(false);
    let live = true;
    withRetry(() => repo.listTracks(selectedId))
      .then((list) => {
        if (!live) return;
        setTracks(list);
        writeCachedTracks(selectedId, list);
        setTracksLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setTracksLoading(false);
        setTracksFailed(true);
      });
    return () => {
      live = false;
    };
  }, [repo, selectedId, reloadKey]);

  const onSelect = (id: string) => {
    setSelectedId(id);
    writeSelectedDistrict(id);
  };

  return (
    <div className="home">
      <header className="home__header">
        <Brand />
        <select
          className="home__districts"
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Район"
        >
          {orderDistricts(districts).map((d) => (
            <option key={d.id} value={d.id}>
              {d.isPrimary ? '★ ' : ''}
              {d.name}
            </option>
          ))}
        </select>
        <button className="home__add" onClick={() => navigate('/add')} aria-label="Добавить трек">
          +
        </button>
        <button
          className="home__settings"
          onClick={() => navigate('/settings')}
          aria-label="Настройки"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
          </svg>
        </button>
      </header>
      {loadFailed || tracksFailed ? (
        <div className="home__empty">
          <p>не получилось загрузить — связь с сервером не идёт</p>
          <button className="btn btn--primary" onClick={() => setReloadKey((k) => k + 1)}>
            повторить
          </button>
        </div>
      ) : loading || tracksLoading ? (
        <div className="home__empty">
          <p>загружаем…</p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="home__empty">
          <p>здесь пока ничего нет</p>
          <button className="btn btn--primary" onClick={() => navigate('/add')}>
            добавить трек
          </button>
        </div>
      ) : (
        <ul className="home__tracks">
          {tracks.map((t) => (
            <li key={t.id}>
              <TrackCard track={t} onClick={(id) => navigate(`/track/${id}`)} />
            </li>
          ))}
        </ul>
      )}
      <footer className="home__attribution">
        карты: CyclOSM · данные © участники OpenStreetMap
      </footer>
    </div>
  );
}
