import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { RepoProvider } from '../data/RepoContext';
import { InMemoryTrackRepository } from '../data/memory';
import type { District, Track } from '../data/repository';
import { writeCachedDistricts, writeCachedTracks } from './homeCache';
import { writeSelectedDistrict } from './sessionDistrict';

vi.mock('../map/MapView', () => ({ MapView: () => <div data-testid="mini-map" /> }));

const { HomePage } = await import('./HomePage');

const GPX = `<?xml version="1.0"?><gpx version="1.1">
<trk><trkseg>
<trkpt lat="51.8" lon="104.9"></trkpt>
<trkpt lat="51.9" lon="104.8"></trkpt>
<trkpt lat="52.0" lon="105.0"></trkpt>
</trkseg></trk></gpx>`;

async function repoWithTrack() {
  const repo = new InMemoryTrackRepository();
  const home = (await repo.listDistricts())[0];
  await repo.addTrack(new File([GPX], 'koltso.gpx', { type: 'application/gpx+xml' }), {
    districtId: home.id,
    category: 'hike',
    name: 'Кольцо Падуна',
  });
  return { repo, homeId: home.id };
}

function renderAt(repo: InstanceType<typeof InMemoryTrackRepository>) {
  return render(
    <RepoProvider repo={repo}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/track/:id" element={<div data-testid="track-page" />} />
          <Route path="/add" element={<div data-testid="add-page" />} />
        </Routes>
      </MemoryRouter>
    </RepoProvider>,
  );
}

test('домашняя: селект районов, карточка трека, клик ведёт на страницу трека', async () => {
  const { repo } = await repoWithTrack();
  renderAt(repo);
  const select = await screen.findByRole('combobox');
  expect(select.textContent).toContain('Рядом');
  const card = await screen.findByRole('button', { name: /Кольцо Падуна/ });
  card.click();
  await waitFor(() => expect(screen.getByTestId('track-page')).toBeTruthy());
});

test('пустой район: «здесь пока ничего нет» и кнопка «добавить трек» на #/add', async () => {
  const { repo } = await repoWithTrack();
  const far = await repo.createDistrict('Далеко');
  renderAt(repo);
  const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
  select.value = far.id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  expect(await screen.findByText('здесь пока ничего нет')).toBeTruthy();
  screen.getByRole('button', { name: /добавить трек/ }).click();
  await waitFor(() => expect(screen.getByTestId('add-page')).toBeTruthy());
});

test('внизу списка — атрибуция карт (мини-карты её не показывают)', async () => {
  const { repo } = await repoWithTrack();
  renderAt(repo);
  expect(await screen.findByText(/CyclOSM/)).toBeTruthy();
  expect(screen.getByText(/OpenStreetMap/)).toBeTruthy();
});

test('шапка: знак-логотип — плитка с горой, roaMark с мятной M', async () => {
  const { repo } = await repoWithTrack();
  const { container } = renderAt(repo);
  const brand = container.querySelector('.home__brand');
  expect(brand).toBeTruthy();
  expect(brand!.querySelector('svg')).toBeTruthy();
  expect(brand!.textContent).toBe('roaMark');
  expect(brand!.querySelector('.home__brand-m')?.textContent).toBe('M');
});

test('селект районов: первым основной со звёздочкой, затем остальные', async () => {
  const { repo } = await repoWithTrack();
  const far = await repo.createDistrict('Далеко');
  await repo.setPrimaryDistrict(far.id);
  renderAt(repo);
  const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
  expect(select.options[0].textContent).toContain('★');
  expect(select.options[0].textContent).toContain('Далеко');
  expect(select.options[1].textContent).toContain('Рядом');
  expect(select.options[1].textContent).not.toContain('★');
});

test('пока районы грузятся — «загружаем…», а не ложное «здесь пока ничего нет»', async () => {
  const { repo } = await repoWithTrack();
  const orig = repo.listDistricts.bind(repo);
  let release!: (list: District[]) => void;
  const gate = new Promise<District[]>((res) => (release = res));
  vi.spyOn(repo, 'listDistricts').mockImplementation(() => gate);
  renderAt(repo);
  expect(screen.getByText('загружаем…')).toBeTruthy();
  expect(screen.queryByText('здесь пока ничего нет')).toBeNull();
  release(await orig());
  expect(await screen.findByRole('button', { name: /Кольцо Падуна/ })).toBeTruthy();
});

test('районы переживают обрыв сети: после двух промахов список загружается', async () => {
  const { repo } = await repoWithTrack();
  const orig = repo.listDistricts.bind(repo);
  vi.spyOn(repo, 'listDistricts')
    .mockRejectedValueOnce(new Error('обрыв'))
    .mockRejectedValueOnce(new Error('обрыв'))
    .mockImplementation(orig);
  renderAt(repo);
  expect(await screen.findByRole('button', { name: /Кольцо Падуна/ })).toBeTruthy();
});

test('когда районы не грузятся — сообщение и кнопка «повторить» лечит', async () => {
  const { repo } = await repoWithTrack();
  const orig = repo.listDistricts.bind(repo);
  const spy = vi.spyOn(repo, 'listDistricts').mockRejectedValue(new Error('обрыв'));
  renderAt(repo);
  expect(await screen.findByText(/не получилось загрузить/i)).toBeTruthy();
  spy.mockImplementation(orig);
  screen.getByRole('button', { name: /повторить/ }).click();
  expect(await screen.findByRole('button', { name: /Кольцо Падуна/ })).toBeTruthy();
});

test('главная рисуется из кэша до ответа сервера, ответ обновляет список', async () => {
  const { repo } = await repoWithTrack();
  const cachedTrack: Track = {
    id: 'cached-t1',
    districtId: 'cached',
    category: 'hike',
    name: 'Старый трек из кэша',
    description: null,
    distanceKm: 7,
    originalFilename: 'old.gpx',
    storagePath: 'old.gpx',
    bounds: null,
    previewSegments: [],
    createdAt: '2026-10-01',
  };
  writeCachedDistricts([{ id: 'cached', name: 'Кэш-район', isPrimary: true }]);
  writeCachedTracks('cached', [cachedTrack]);
  writeSelectedDistrict('cached');
  const orig = repo.listDistricts.bind(repo);
  let release!: (list: District[]) => void;
  const gate = new Promise<District[]>((res) => (release = res));
  vi.spyOn(repo, 'listDistricts').mockImplementation(() => gate);
  renderAt(repo);
  // До ответа сервера кэш уже на экране — без «загружаем…».
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  expect(select.textContent).toContain('Кэш-район');
  expect(screen.getByText('Старый трек из кэша')).toBeTruthy();
  expect(screen.queryByText('загружаем…')).toBeNull();
  // Ответ сервера заменяет кэш живыми данными.
  release(await orig());
  expect(await screen.findByRole('button', { name: /Кольцо Падуна/ })).toBeTruthy();
  expect(screen.queryByText('Старый трек из кэша')).toBeNull();
});
