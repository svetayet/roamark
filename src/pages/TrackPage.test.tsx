import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
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
  const repo = new InMemoryTrackRepository();
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

test('страница трека: имя, категория, км, район, описание, скачать с оригинальным именем', async () => {
  const { repo, track } = await makeRepo();
  renderAt(repo, track.id);
  expect(await screen.findByText('Кольцо Падуна')).toBeTruthy();
  expect(screen.getByText('вело')).toBeTruthy();
  expect(screen.getByText('12,4 км')).toBeTruthy();
  expect(screen.getByText('★ Рядом', { exact: false })).toBeTruthy();
  expect(screen.getByText('любимая покатушка выходного дня')).toBeTruthy();
  const link = await screen.findByRole('link', { name: /Скачать GPX/ });
  expect(link.getAttribute('download')).toBe('кольцо падуна 😎.gpx');
  expect(link.getAttribute('href')).toBeTruthy();
  expect(screen.getByTestId('map')).toBeTruthy();
});

test('скачивание предпочитает data:-ссылку от getGpxDataUrl', async () => {
  const { repo, track } = await makeRepo();
  vi.spyOn(repo, 'getDownloadUrl').mockResolvedValue('blob:mock');
  vi.spyOn(repo, 'getGpxDataUrl').mockResolvedValue('data:application/gpx+xml;charset=utf-8,x');
  renderAt(repo, track.id);
  const link = await screen.findByRole('link', { name: /Скачать GPX/ });
  expect(link.getAttribute('href')?.startsWith('data:application/gpx+xml')).toBe(true);
});

test('длинный data:-URL не влез в лимит — откат на blob:', async () => {
  const { repo, track } = await makeRepo();
  vi.spyOn(repo, 'getDownloadUrl').mockResolvedValue('blob:mock');
  const dataSpy = vi.spyOn(repo, 'getGpxDataUrl').mockResolvedValue(
    'data:application/gpx+xml;charset=utf-8,' + 'x'.repeat(2_100_000),
  );
  renderAt(repo, track.id);
  const link = await screen.findByRole('link', { name: /Скачать GPX/ });
  expect(dataSpy).toHaveBeenCalled();
  expect(link.getAttribute('href')).toBe('blob:mock');
});

test('«изменить» ведёт на /add/:id', async () => {
  const { repo, track } = await makeRepo();
  renderAt(repo, track.id);
  (await screen.findByRole('button', { name: /изменить/ })).click();
  await waitFor(() => expect(screen.getByTestId('add-edit')).toBeTruthy());
});

test('шапка: логотип и кнопки на месте, клик по логотипу возвращает на главную', async () => {
  const { repo, track } = await makeRepo();
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  expect(screen.getByRole('button', { name: 'Синхронизация' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Настройки' })).toBeTruthy();
  screen.getByRole('button', { name: 'roaMark — на главную' }).click();
  await waitFor(() => expect(screen.getByTestId('home-page')).toBeTruthy());
});

test('«удалить» — два шага: первый клик ничего не удаляет', async () => {
  // window.confirm в PWA на телефоне молча возвращает «отмена» —
  // подтверждение только кнопками, браузерные диалоги не используем.
  const { repo, track } = await makeRepo();
  const deleteSpy = vi.spyOn(repo, 'deleteTrack');
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  screen.getByRole('button', { name: 'удалить' }).click();
  expect(await screen.findByRole('button', { name: 'точно удалить?' })).toBeTruthy();
  expect(deleteSpy).not.toHaveBeenCalled();
  await expect(repo.getTrack(track.id)).resolves.toBeTruthy();
});

test('второй шаг «точно удалить?» удаляет и возвращает домой', async () => {
  const { repo, track } = await makeRepo();
  const deleteSpy = vi.spyOn(repo, 'deleteTrack');
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  screen.getByRole('button', { name: 'удалить' }).click();
  (await screen.findByRole('button', { name: 'точно удалить?' })).click();
  await waitFor(() => expect(screen.getByTestId('home-page')).toBeTruthy());
  expect(deleteSpy).toHaveBeenCalledWith(track.id);
  await expect(repo.getTrack(track.id)).rejects.toBeTruthy();
});

test('«отмена» возвращает обычную кнопку, ничего не удаляет', async () => {
  const { repo, track } = await makeRepo();
  const deleteSpy = vi.spyOn(repo, 'deleteTrack');
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  screen.getByRole('button', { name: 'удалить' }).click();
  (await screen.findByRole('button', { name: 'отмена' })).click();
  expect(await screen.findByRole('button', { name: 'удалить' })).toBeTruthy();
  expect(deleteSpy).not.toHaveBeenCalled();
});

test('неудачное удаление: сообщение, остаёмся на странице трека', async () => {
  const { repo, track } = await makeRepo();
  vi.spyOn(repo, 'deleteTrack').mockRejectedValueOnce(new Error('offline'));
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  screen.getByRole('button', { name: 'удалить' }).click();
  (await screen.findByRole('button', { name: 'точно удалить?' })).click();
  expect(await screen.findByText('Не получилось удалить. Попробуй ещё раз.')).toBeTruthy();
  expect(screen.getByText('Кольцо Падуна')).toBeTruthy();
});

// —– «Поделиться» через Web Share API ——

afterEach(() => {
  // Заглушки navigator.share/canShare не должны протекать между тестами.
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

function stubShare(implementation: (data: ShareData) => Promise<void>) {
  const shareSpy = vi.fn(implementation);
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable: true, value: shareSpy });
  return shareSpy;
}

test('без поддержки Web Share кнопки «Поделиться» нет', async () => {
  const { repo, track } = await makeRepo();
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  expect(screen.queryByRole('button', { name: 'Поделиться' })).toBeNull();
});

test('«Поделиться» вызывает navigator.share с файлом оригинального имени и типа', async () => {
  const shareSpy = stubShare(() => Promise.resolve());
  const { repo, track } = await makeRepo();
  renderAt(repo, track.id);
  (await screen.findByRole('button', { name: 'Поделиться' })).click();
  await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
  const arg = shareSpy.mock.calls[0][0];
  expect(arg.files).toHaveLength(1);
  const shared = arg.files?.[0];
  expect(shared?.name).toBe('кольцо падуна 😎.gpx');
  expect(shared?.type).toBe('application/gpx+xml');
  expect(arg.title).toBe('Кольцо Падуна');
});

test('отказ пользователя от шеринга — не ошибка', async () => {
  const shareSpy = stubShare(() => Promise.reject(new DOMException('отмена', 'AbortError')));
  const { repo, track } = await makeRepo();
  renderAt(repo, track.id);
  (await screen.findByRole('button', { name: 'Поделиться' })).click();
  await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Не получилось поделиться/)).toBeNull();
});

test('ошибка шеринга показывает подробность и оставляет страницу', async () => {
  stubShare(() => Promise.reject(new DOMException('запрещено', 'NotAllowedError')));
  const { repo, track } = await makeRepo();
  renderAt(repo, track.id);
  (await screen.findByRole('button', { name: 'Поделиться' })).click();
  expect(
    await screen.findByText('Не получилось поделиться: NotAllowedError: запрещено'),
  ).toBeTruthy();
  expect(screen.getByText('Кольцо Падуна')).toBeTruthy();
});

test('пока GPX не прочитан, кнопки «Поделиться» нет', async () => {
  stubShare(() => Promise.resolve());
  const { repo, track } = await makeRepo();
  vi.spyOn(repo, 'getGpxFile').mockReturnValueOnce(new Promise(() => {}));
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  expect(screen.queryByRole('button', { name: 'Поделиться' })).toBeNull();
});

test('если GPX не удалось прочитать, кнопки «Поделиться» нет', async () => {
  stubShare(() => Promise.resolve());
  const { repo, track } = await makeRepo();
  vi.spyOn(repo, 'getGpxFile').mockRejectedValueOnce(new Error('нет байтов'));
  renderAt(repo, track.id);
  await screen.findByText('Кольцо Падуна');
  expect(screen.queryByRole('button', { name: 'Поделиться' })).toBeNull();
});
