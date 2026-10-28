import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { RepoProvider } from '../data/RepoContext';
import { InMemoryTrackRepository } from '../data/memory';

vi.mock('../map/MapView', () => ({ MapView: () => <div data-testid="map" /> }));

const { TrackPage } = await import('./TrackPage');

const GPX = `<?xml version="1.0"?><gpx version="1.1">
<trk><trkseg>
<trkpt lat="51.8" lon="104.9"></trkpt>
<trkpt lat="51.9" lon="104.8"></trkpt>
<trkpt lat="52.0" lon="105.0"></trkpt>
</trkseg></trk></gpx>`;

async function makeRepo() {
  const repo = new InMemoryTrackRepository({ demo: true });
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(
    new File([GPX], 'кольцо падуна 😎.gpx', { type: 'application/gpx+xml' }),
    {
      districtId: home.id,
      category: 'bike',
      name: 'Кольцо Падуна',
      description: 'любимая покатушка выходного дня',
    },
  );
  track.distanceKm = 12.36; // фикстура километрова для «12,4 км»
  return { repo, track };
}

function renderAt(repo: InstanceType<typeof InMemoryTrackRepository>, trackId: string) {
  return render(
    <RepoProvider repo={repo}>
      <MemoryRouter initialEntries={[`/track/${trackId}`]}>
        <Routes>
          <Route path="/track/:id" element={<TrackPage />} />
          <Route path="/add/:trackId" element={<div data-testid="add-edit" />} />
          <Route path="/" element={<div data-testid="home-page" />} />
        </Routes>
      </MemoryRouter>
    </RepoProvider>,
  );
}

test('страница трека: имя, категория, км, описание, скачать с оригинальным именем', async () => {
  const { repo, track } = await makeRepo();
  renderAt(repo, track.id);
  expect(await screen.findByText('Кольцо Падуна')).toBeTruthy();
  expect(screen.getByText('вело')).toBeTruthy();
  expect(screen.getByText('12,4 км')).toBeTruthy();
  expect(screen.getByText('любимая покатушка выходного дня')).toBeTruthy();
  const link = await screen.findByRole('link', { name: /Скачать GPX/ });
  expect(link.getAttribute('download')).toBe('кольцо падуна 😎.gpx');
  expect(link.getAttribute('href')).toBeTruthy();
  expect(screen.getByTestId('map')).toBeTruthy();
});

test('«изменить» ведёт на /add/:id', async () => {
  const { repo, track } = await makeRepo();
  renderAt(repo, track.id);
  (await screen.findByRole('button', { name: /изменить/ })).click();
  await waitFor(() => expect(screen.getByTestId('add-edit')).toBeTruthy());
});

test('«удалить» с подтверждением: deleteTrack и возврат домой', async () => {
  const { repo, track } = await makeRepo();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const deleteSpy = vi.spyOn(repo, 'deleteTrack');
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  screen.getByRole('button', { name: /удалить/ }).click();
  await waitFor(() => expect(screen.getByTestId('home-page')).toBeTruthy());
  expect(deleteSpy).toHaveBeenCalledWith(track.id);
  await expect(repo.getTrack(track.id)).rejects.toBeTruthy();
  confirm.mockRestore();
});

test('«удалить» без подтверждения ничего не делает', async () => {
  const { repo, track } = await makeRepo();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const deleteSpy = vi.spyOn(repo, 'deleteTrack');
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  screen.getByRole('button', { name: /удалить/ }).click();
  await expect(repo.getTrack(track.id)).resolves.toBeTruthy();
  expect(deleteSpy).not.toHaveBeenCalled();
  confirm.mockRestore();
});
