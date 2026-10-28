import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';
import type { District, Track } from '../data/repository';
import { TrackCard } from '../components/TrackCard';

const DISTRICT_KEY = 'roamark.district';

/** Главная: шапка с селектом районов, кнопка «+», список треков основного экрана. */
export function HomePage() {
  const repo = useRepo();
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISTRICT_KEY);
    } catch {
      return null;
    }
  });
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    repo.listDistricts().then((list) => {
      setDistricts(list);
      setSelectedId((current) => {
        if (current && list.some((d) => d.id === current)) return current;
        return (list.find((d) => d.isPrimary) ?? list[0])?.id ?? null;
      });
    });
  }, [repo]);

  useEffect(() => {
    if (!selectedId) {
      setTracks([]);
      return;
    }
    let live = true;
    repo.listTracks(selectedId).then((list) => {
      if (live) setTracks(list);
    });
    return () => {
      live = false;
    };
  }, [repo, selectedId]);

  const onSelect = (id: string) => {
    setSelectedId(id);
    try {
      sessionStorage.setItem(DISTRICT_KEY, id);
    } catch {
      /* без sessionStorage выбор живёт до перезагрузки */
    }
  };

  return (
    <div className="home">
      <header className="home__header">
        <span className="home__brand">roaMark</span>
        <select
          className="home__districts"
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Район"
        >
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.isPrimary ? '⌂ ' : ''}
              {d.name}
            </option>
          ))}
        </select>
        <button className="home__add" onClick={() => navigate('/add')} aria-label="Добавить трек">
          +
        </button>
      </header>
      {tracks.length === 0 ? (
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
    </div>
  );
}
