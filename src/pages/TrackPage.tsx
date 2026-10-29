import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';
import { RepositoryError, type Track } from '../data/repository';
import type { LatLng } from '../data/types';
import { parseGpxSegments } from '../logic/gpx';
import { formatKm } from '../logic/format';
import { MapView } from '../map/MapView';
import { ActivityIcon, CATEGORY_LABELS } from '../components/ActivityIcon';

/** Страница трека: большая карта сверху, метаданные и главная кнопка — скачать GPX. */
export function TrackPage() {
  const { id } = useParams();
  const repo = useRepo();
  const navigate = useNavigate();
  const [track, setTrack] = useState<Track | null>(null);
  const [segments, setSegments] = useState<LatLng[][]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    repo
      .getTrack(id)
      .then(async (t) => {
        if (!live) return;
        setTrack(t);
        const text = await repo.getGpxText(id);
        if (live) setSegments(parseGpxSegments(text));
        const url = await repo.getDownloadUrl(id);
        if (live) setDownloadUrl(url);
      })
      .catch((e) => {
        if (live) setError(e instanceof RepositoryError ? e.message : 'Трек не найден.');
      });
    return () => {
      live = false;
    };
  }, [repo, id]);

  if (error) {
    return (
      <div className="page">
        <p className="form-errors">{error}</p>
        <button className="btn" onClick={() => navigate('/')}>
          на главную
        </button>
      </div>
    );
  }
  if (!track) return null;

  const remove = async () => {
    if (!window.confirm('Удалить трек? GPX-файл тоже исчезнет.')) return;
    setDeleteError(null);
    try {
      await repo.deleteTrack(track.id);
      navigate('/');
    } catch {
      setDeleteError('Не получилось удалить. Попробуй ещё раз.');
    }
  };

  return (
    <div className="page page--track">
      <div className="track-map">
        <MapView segments={segments} />
      </div>
      <div className="page__header">
        <button className="link" onClick={() => navigate('/')}>
          ← все треки
        </button>
      </div>
      <div className="track-meta">
        <h1 className="track-meta__name">{track.name}</h1>
        <p className="track-meta__row">
          <ActivityIcon category={track.category} />
          <span>{CATEGORY_LABELS[track.category]}</span>
          <span>·</span>
          <span>{formatKm(track.distanceKm)}</span>
        </p>
        {track.description && <p className="track-meta__desc">{track.description}</p>}
        {downloadUrl && (
          <a
            className="btn btn--primary btn--big track-meta__download"
            href={downloadUrl}
            download={track.originalFilename}
          >
            Скачать GPX
          </a>
        )}
        <div className="track-meta__actions">
          <button className="btn" onClick={() => navigate(`/add/${track.id}`)}>
            изменить
          </button>
          <button className="btn btn--danger" onClick={remove}>
            удалить
          </button>
        </div>
        {deleteError && <p className="form-errors">{deleteError}</p>}
      </div>
    </div>
  );
}
