import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';
import { RepositoryError, type District, type Track } from '../data/repository';
import type { LatLng } from '../data/types';
import { parseGpxSegments } from '../logic/gpx';
import { formatKm } from '../logic/format';
import { MapView } from '../map/MapView';
import { ActivityIcon, CATEGORY_LABELS } from '../components/ActivityIcon';
import { AppHeader } from '../components/AppHeader';
import { PencilIcon, TrashIcon } from '../components/icons';

/** Страница трека: общая шапка, большая карта, метаданные и главная кнопка — скачать GPX. */
export function TrackPage() {
  const { id } = useParams();
  const repo = useRepo();
  const navigate = useNavigate();
  const [track, setTrack] = useState<Track | null>(null);
  const [district, setDistrict] = useState<District | null>(null);
  const [segments, setSegments] = useState<LatLng[][]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  // GPX, готовый к Web Share: читается заранее, чтобы по клику отдать файл
  // в navigator.share без единого await — иначе гаснет пользовательский
  // жест и Android отвечает NotAllowedError: Permission denied.
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  // Подтверждение удаления — только кнопками: window.confirm в PWA
  // на телефоне молча подавляется и удаление тихо срывается.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    repo
      .getTrack(id)
      .then(async (t) => {
        if (!live) return;
        setTrack(t);
        const list = await repo.listDistricts();
        if (live) setDistrict(list.find((d) => d.id === t.districtId) ?? null);
        const text = await repo.getGpxText(id);
        if (live) setSegments(parseGpxSegments(text));
        const url = await repo.getDownloadUrl(id);
        if (live) setDownloadUrl(url);
      })
      .catch((e) => {
        if (live) setError(e instanceof RepositoryError ? e.message : 'Трек не найден.');
      });
    // Отдельно от основного чтения: неудача не роняет страницу —
    // просто не появится кнопка «Поделиться».
    repo
      .getGpxFile(id)
      .then((f) => {
        if (live) setGpxFile(f);
      })
      .catch(() => {
        if (live) setGpxFile(null);
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

  // Web Share API умеет передавать файл с правильным MIME-типом напрямую
  // в приложения телефона — в отличие от скачивания, где Chromium
  // записывает blob как octet-stream и теряются обработчики GPX (Maps.me).
  const shareSupported =
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({
      files: [new File([], 'track.gpx', { type: 'application/gpx+xml' })],
    });

  const remove = async () => {
    setDeleteError(null);
    try {
      await repo.deleteTrack(track.id);
      navigate('/');
    } catch {
      setDeleteError('Не получилось удалить. Попробуй ещё раз.');
      setConfirmingDelete(false);
    }
  };

  const share = () => {
    setShareError(null);
    if (!track || !gpxFile) return;
    // navigator.share вызывается строго синхронно в обработчике клика:
    // любой await в пути нажатия гасит transient activation, и Android
    // отвергает шаринг с NotAllowedError: Permission denied.
    navigator.share
      ?.({ files: [gpxFile], title: track.name })
      .catch((e) => {
        // Отказ пользователя в системной шторке — нормальный исход, не ошибка.
        if (e instanceof DOMException && e.name === 'AbortError') return;
        // Тип и текст настоящей ошибки показываем: телефоны ведут себя
        // по-разному, без подробности причину не найти.
        const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        setShareError(`Не получилось поделиться: ${detail}`);
      });
  };

  return (
    <div className="page page--track">
      <AppHeader />
      <div className="track-map">
        <MapView segments={segments} />
      </div>
      <div className="track-meta">
        <div className="track-meta__head">
          <h1 className="track-meta__name">{track.name}</h1>
          <span className="track-meta__tools">
            <button
              className="icon-btn"
              aria-label="изменить"
              title="изменить"
              onClick={() => navigate(`/add/${track.id}`)}
            >
              <PencilIcon />
            </button>
            <button
              className="icon-btn icon-btn--danger"
              aria-label="удалить"
              title="удалить"
              onClick={() => setConfirmingDelete(true)}
            >
              <TrashIcon />
            </button>
          </span>
        </div>
        {confirmingDelete && (
          <div className="track-meta__actions">
            <button className="btn btn--danger" onClick={() => void remove()}>
              точно удалить?
            </button>
            <button className="btn" onClick={() => setConfirmingDelete(false)}>
              отмена
            </button>
          </div>
        )}
        <p className="track-meta__row">
          <ActivityIcon category={track.category} />
          <span>{CATEGORY_LABELS[track.category]}</span>
          <span>·</span>
          <span>{formatKm(track.distanceKm)}</span>
          {district && (
            <>
              <span>·</span>
              <span>
                {district.isPrimary ? '★ ' : ''}
                {district.name}
              </span>
            </>
          )}
        </p>
        {track.description && <p className="track-meta__desc">{track.description}</p>}
        {(downloadUrl || shareSupported) && (
          <div className="track-meta__buttons">
            {downloadUrl && (
              <a
                className="btn btn--primary btn--big track-meta__download"
                href={downloadUrl}
                download={track.originalFilename}
              >
                Скачать GPX
              </a>
            )}
            {shareSupported && gpxFile && (
              <button className="btn btn--big" onClick={() => share()}>
                Поделиться
              </button>
            )}
          </div>
        )}
        {shareError && <p className="form-errors">{shareError}</p>}
        {deleteError && <p className="form-errors">{deleteError}</p>}
      </div>
    </div>
  );
}
