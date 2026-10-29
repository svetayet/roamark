import { useEffect, useState } from 'react';
import type { Track } from '../data/repository';
import { useRepo } from '../data/RepoContext';
import { formatKm } from '../logic/format';
import { MapView } from '../map/MapView';
import { ActivityIcon } from './ActivityIcon';

/** Карточка трека в списке: мини-карта, значок+имя+км в строке, описание ниже, справа — скачивание. */
export function TrackCard({ track, onClick }: { track: Track; onClick(id: string): void }) {
  const repo = useRepo();
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    repo
      .getDownloadUrl(track.id)
      .then((url) => {
        if (live) setDownloadUrl(url);
      })
      .catch(() => {
        /* без ссылки кнопки скачивания не будет — скачать можно со страницы трека */
      });
    return () => {
      live = false;
    };
  }, [repo, track.id]);

  return (
    <div className="track-card">
      <button className="track-card__main" onClick={() => onClick(track.id)}>
        <span className="track-card__map">
          <MapView segments={track.previewSegments} interactive={false} attribution={false} />
        </span>
        <span className="track-card__body">
          <span className="track-card__title">
            <ActivityIcon category={track.category} />
            <span className="track-card__name">{track.name}</span>
            <span className="track-card__km">{formatKm(track.distanceKm)}</span>
          </span>
          {track.description && <span className="track-card__desc">{track.description}</span>}
        </span>
      </button>
      {downloadUrl && (
        <a
          className="track-card__download"
          href={downloadUrl}
          download={track.originalFilename}
          aria-label="скачать GPX"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 11 5 5 5-5" />
            <path d="M4 20h16" />
          </svg>
        </a>
      )}
    </div>
  );
}
