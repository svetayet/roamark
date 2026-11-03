import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';
import type { District, Track } from '../data/repository';
import { TrackCard } from '../components/TrackCard';
import { AppHeader } from '../components/AppHeader';
import { orderDistricts } from '../logic/districts';
import { readSelectedDistrict, writeSelectedDistrict } from './sessionDistrict';

/** Главная: общая шапка, строка районов во всю ширину под ней, список треков. */
export function HomePage() {
  const repo = useRepo();
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelectedDistrict());
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracksLoading, setTracksLoading] = useState(true);
  // Хранилище локальное и быстрое; если чтение всё же упало — честная ошибка
  // и повтор одним нажатием, без авто-повторов и кэша.
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    repo
      .listDistricts()
      .then((list) => {
        if (!live) return;
        setDistricts(list);
        setSelectedId((current) => {
          if (current && list.some((d) => d.id === current)) return current;
          return (list.find((d) => d.isPrimary) ?? list[0])?.id ?? null;
        });
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setLoading(false);
        setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [repo, reloadKey]);

  useEffect(() => {
    if (!selectedId) {
      setTracks([]);
      setTracksLoading(false);
      return;
    }
    let live = true;
    setTracksLoading(true);
    repo
      .listTracks(selectedId)
      .then((list) => {
        if (!live) return;
        setTracks(list);
        setTracksLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setTracksLoading(false);
        setFailed(true);
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
      <AppHeader />
      <div className="home__districtbar">
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
      </div>
      {failed ? (
        <div className="home__empty">
          <p>не получилось загрузить</p>
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
