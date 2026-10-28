import type { Track } from '../data/repository';
import { formatKm } from '../logic/format';
import { MapView } from '../map/MapView';
import { ActivityIcon } from './ActivityIcon';

/** Карточка трека в списке: мини-карта, имя, иконка активности, километры. */
export function TrackCard({ track, onClick }: { track: Track; onClick(id: string): void }) {
  return (
    <button className="track-card" onClick={() => onClick(track.id)}>
      <span className="track-card__map">
        <MapView segments={track.previewSegments} interactive={false} />
      </span>
      <span className="track-card__body">
        <span className="track-card__name">{track.name}</span>
        <span className="track-card__meta">
          <ActivityIcon category={track.category} />
          <span>{formatKm(track.distanceKm)}</span>
        </span>
      </span>
    </button>
  );
}
