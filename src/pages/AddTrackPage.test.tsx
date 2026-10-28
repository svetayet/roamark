import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { RepoProvider } from '../data/RepoContext';
import { InMemoryTrackRepository } from '../data/memory';
import { formatKm } from '../logic/format';
import { parseGpxSegments } from '../logic/gpx';
import { segmentsDistanceKm } from '../logic/geo';

vi.mock('../map/MapView', () => ({ MapView: () => <div data-testid="map" /> }));

const { AddTrackPage } = await import('./AddTrackPage');

const GPX = `<?xml version="1.0"?><gpx version="1.1">
<trk><trkseg>
<trkpt lat="51.8" lon="104.9"></trkpt>
<trkpt lat="51.9" lon="104.8"></trkpt>
<trkpt lat="52.0" lon="105.0"></trkpt>
</trkseg></trk></gpx>`;

const EXPECTED_KM = formatKm(segmentsDistanceKm(parseGpxSegments(GPX)));

const gpxFile = (name = 'Кольцо Падуна.gpx') =>
  new File([GPX], name, { type: 'application/gpx+xml' });

async function repoWithTrack() {
  const repo = new InMemoryTrackRepository({ demo: true });
  const home = (await repo.listDistricts())[0];
  const track = await repo.addTrack(gpxFile(), {
    districtId: home.id,
    category: 'hike',
    name: 'Кольцо Падуна',
  });
  return { repo, homeId: home.id, track };
}

function renderAt(repo: InstanceType<typeof InMemoryTrackRepository>, path: string) {
  return render(
    <RepoProvider repo={repo}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/add" element={<AddTrackPage />} />
          <Route path="/add/:trackId" element={<AddTrackPage />} />
          <Route path="/track/:id" element={<div data-testid="track-page" />} />
          <Route path="/" element={<div data-testid="home-page" />} />
        </Routes>
      </MemoryRouter>
    </RepoProvider>,
  );
}

function chooseFile(file: File) {
  const input = screen.getByLabelText('файл GPX') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

test('валидный GPX: «✓ км», название автозаполнено из имени файла', async () => {
  const repo = new InMemoryTrackRepository({ demo: true });
  renderAt(repo, '/add');
  chooseFile(gpxFile());
  expect(await screen.findByText(`✓ ${EXPECTED_KM}`)).toBeTruthy();
  expect((screen.getByLabelText('название') as HTMLInputElement).value).toBe('Кольцо Падуна');
});

test('не-GPX файл: ошибка, «сохранить» недоступна', async () => {
  const repo = new InMemoryTrackRepository({ demo: true });
  renderAt(repo, '/add');
  chooseFile(new File(['просто текст, не трек'], 'заметка.txt', { type: 'text/plain' }));
  expect(
    await screen.findByText('Не удалось прочитать файл — похоже, это не GPX.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: /сохранить/ })).toBeDisabled();
});

test('submit: трек в репозитории, редирект на страницу трека', async () => {
  const repo = new InMemoryTrackRepository({ demo: true });
  const home = (await repo.listDistricts())[0];
  renderAt(repo, '/add');
  chooseFile(gpxFile());
  await screen.findByText(`✓ ${EXPECTED_KM}`);
  screen.getByRole('button', { name: /сохранить/ }).click();
  await waitFor(() => expect(screen.getByTestId('track-page')).toBeTruthy());
  const list = await repo.listTracks(home.id);
  expect(list).toHaveLength(1);
  expect(list[0].name).toBe('Кольцо Падуна');
});

test('edit: поля предзаполнены, файла нет, дистанция не меняется', async () => {
  const { repo, track } = await repoWithTrack();
  renderAt(repo, `/add/${track.id}`);
  const nameInput = (await screen.findByLabelText('название')) as HTMLInputElement;
  expect(nameInput.value).toBe('Кольцо Падуна');
  expect(screen.queryByLabelText('файл GPX')).toBeNull();
  fireEvent.input(nameInput, { target: { value: 'Новое имя' } });
  screen.getByRole('button', { name: /сохранить/ }).click();
  await waitFor(() => expect(screen.getByTestId('track-page')).toBeTruthy());
  const updated = await repo.getTrack(track.id);
  expect(updated.name).toBe('Новое имя');
  expect(updated.distanceKm).toBe(track.distanceKm);
});
