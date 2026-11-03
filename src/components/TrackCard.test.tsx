import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { RepoProvider } from '../data/RepoContext';
import { InMemoryTrackRepository } from '../data/memory';
import type { Track, TrackRepository } from '../data/repository';
import { TrackCard } from './TrackCard';

vi.mock('../map/MapView', () => ({ MapView: () => <div data-testid="mini-map" /> }));

const GPX = `<?xml version="1.0"?><gpx version="1.1">
<trk><trkseg>
<trkpt lat="51.8" lon="104.9"></trkpt>
<trkpt lat="51.9" lon="104.8"></trkpt>
</trkseg></trk></gpx>`;

/** Трек с фикстурным километражем; repo (если передан) содержит этот трек — для ссылки скачивания. */
async function makeTrack(): Promise<{ track: Track; repo: InMemoryTrackRepository }> {
  const repo = new InMemoryTrackRepository();
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(
    new File([GPX], 'koltso.gpx', { type: 'application/gpx+xml' }),
    {
      districtId: home.id,
      category: 'hike',
      name: 'Кольцо Падуна',
      description: 'любимая покатушка выходного дня',
    },
  );
  track.distanceKm = 12.36; // фикстура километража для «12,4 км»
  return { track, repo };
}

function renderCard(track: Track, onClick: (id: string) => void, repo: TrackRepository) {
  return render(
    <RepoProvider repo={repo}>
      <TrackCard track={track} onClick={onClick} />
    </RepoProvider>,
  );
}

test('карточка: значок и название в строке, километры под кнопкой скачивания, описание ниже', async () => {
  const { track, repo } = await makeTrack();
  renderCard(track, vi.fn(), repo);
  const title = screen.getByText('Кольцо Падуна').closest('.track-card__title');
  expect(title).toBeTruthy();
  expect(title).toContainElement(title!.querySelector('svg'));
  // Километраж больше не мешает названию — он в правой колонке
  expect(title!.textContent).not.toContain('12,4');
  const link = await screen.findByRole('link', { name: 'скачать GPX' });
  const side = link.closest('.track-card__side');
  expect(side).toBeTruthy();
  expect(side).toContainElement(screen.getByText('12,4 км'));
  const desc = screen.getByText('любимая покатушка выходного дня');
  expect(desc.classList.contains('track-card__desc')).toBe(true);
  expect(screen.getByTestId('mini-map')).toBeTruthy();
});

test('карточка: клик по основной части открывает трек', async () => {
  const { track, repo } = await makeTrack();
  const onClick = vi.fn();
  renderCard(track, onClick, repo);
  screen.getByRole('button', { name: /Кольцо Падуна/ }).click();
  expect(onClick).toHaveBeenCalledWith(track.id);
});

test('карточка: справа кнопка скачивания с оригинальным именем файла', async () => {
  const { track, repo } = await makeTrack();
  renderCard(track, vi.fn(), repo);
  const link = await screen.findByRole('link', { name: 'скачать GPX' });
  expect(link.getAttribute('download')).toBe('koltso.gpx');
  expect(link.getAttribute('href')).toContain('data:');
});
