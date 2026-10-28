import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TrackCard } from './TrackCard';
import type { Track } from '../data/repository';

vi.mock('../map/MapView', () => ({ MapView: () => <div data-testid="mini-map" /> }));

const track: Track = {
  id: 't1',
  districtId: 'd1',
  category: 'hike',
  name: 'Кольцо Падуна',
  description: null,
  distanceKm: 12.36,
  originalFilename: 'koltso.gpx',
  storagePath: 't1.gpx',
  bounds: null,
  previewSegments: [
    [
      { lat: 51.8, lon: 104.9 },
      { lat: 51.9, lon: 105.0 },
    ],
  ],
  createdAt: '2026-10-28T10:00:00.000Z',
};

test('карточка: имя, километры, иконка категории, мини-карта, клик', () => {
  const onClick = vi.fn();
  const { container } = render(<TrackCard track={track} onClick={onClick} />);
  expect(screen.getByText('Кольцо Падуна')).toBeTruthy();
  expect(screen.getByText('12,4 км')).toBeTruthy();
  expect(container.querySelector('svg')).toBeTruthy();
  expect(screen.getByTestId('mini-map')).toBeTruthy();
  screen.getByRole('button', { name: /Кольцо Падуна/ }).click();
  expect(onClick).toHaveBeenCalledWith(track.id);
});
