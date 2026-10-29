import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { RepoProvider } from '../data/RepoContext';
import { InMemoryTrackRepository } from '../data/memory';
import { ThemeProvider } from '../theme/theme';

const { SettingsPage } = await import('./SettingsPage');

const GPX = `<?xml version="1.0"?><gpx version="1.1">
<trk><trkseg>
<trkpt lat="51.8" lon="104.9"></trkpt>
<trkpt lat="51.9" lon="104.8"></trkpt>
</trkseg></trk></gpx>`;

async function setup() {
  const repo = new InMemoryTrackRepository({ demo: true });
  const home = (await repo.listDistricts())[0];
  await repo.addTrack(new File([GPX], 't.gpx', { type: 'application/gpx+xml' }), {
    districtId: home.id,
    category: 'hike',
    name: 'Трек',
  });
  const far = await repo.createDistrict('Далеко');
  return { repo, home, far };
}

function renderSettings(repo: InstanceType<typeof InMemoryTrackRepository>) {
  return render(
    <ThemeProvider>
      <RepoProvider repo={repo}>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/" element={<div data-testid="home-page" />} />
            <Route path="/login" element={<div data-testid="login-page" />} />
          </Routes>
        </MemoryRouter>
      </RepoProvider>
    </ThemeProvider>,
  );
}

const rowOf = (name: string) => {
  const el = screen.getByText(name, { exact: false }).closest('li')!;
  return within(el as HTMLElement);
};

test('тема: три радио, текущая отмечена, выбор меняет pref', async () => {
  const { repo } = await setup();
  renderSettings(repo);
  expect(
    ((await screen.findByRole('radio', { name: 'системная' })) as HTMLInputElement).checked,
  ).toBe(true);
  screen.getByRole('radio', { name: 'тёмная' }).click();
  await waitFor(() =>
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark'),
  );
  expect((screen.getByRole('radio', { name: 'тёмная' }) as HTMLInputElement).checked).toBe(
    true,
  );
});

test('районы: основной помечен ⌂; «сделать основным» переключает ровно один', async () => {
  const { repo, home, far } = await setup();
  renderSettings(repo);
  await screen.findByText('Рядом', { exact: false });
  rowOf('Далеко').getByRole('button', { name: /сделать основным/ }).click();
  await waitFor(async () => {
    const list = await repo.listDistricts();
    expect(list.filter((d) => d.isPrimary)).toHaveLength(1);
    expect(list.find((d) => d.id === far.id)?.isPrimary).toBe(true);
    expect(list.find((d) => d.id === home.id)?.isPrimary).toBe(false);
  });
});

test('удаление района с треками: подсказка, список не меняется; пустой — удаляется', async () => {
  const { repo, far } = await setup();
  renderSettings(repo);
  await screen.findByText('Рядом', { exact: false });
  rowOf('Рядом').getByRole('button', { name: /удалить/ }).click();
  await waitFor(() =>
    expect(screen.getByText(/в районе есть треки/i)).toBeTruthy(),
  );
  expect(await repo.listDistricts()).toHaveLength(2);
  rowOf('Далеко').getByRole('button', { name: /удалить/ }).click();
  await waitFor(async () => {
    const list = await repo.listDistricts();
    expect(list.some((d) => d.id === far.id)).toBe(false);
    expect(list).toHaveLength(1);
  });
});

test('переименование: инлайн-input меняет имя', async () => {
  const { repo, far } = await setup();
  renderSettings(repo);
  await screen.findByText('Рядом', { exact: false });
  // Строку захватываем до клика: имя уезжает в input.
  const row = rowOf('Далеко');
  row.getByRole('button', { name: /переименовать/ }).click();
  const input = await waitFor(() => row.getByLabelText('имя района') as HTMLInputElement);
  fireEvent.input(input, { target: { value: 'Совсем далеко' } });
  row.getByRole('button', { name: /готово/ }).click();
  await waitFor(async () => {
    const list = await repo.listDistricts();
    expect(list.find((d) => d.id === far.id)?.name).toBe('Совсем далеко');
  });
});

test('«выйти» зовёт signOut', async () => {
  const { repo } = await setup();
  const spy = vi.spyOn(repo, 'signOut');
  renderSettings(repo);
  await screen.findByText('Рядом', { exact: false });
  screen.getByRole('button', { name: /выйти/ }).click();
  await waitFor(() => expect(spy).toHaveBeenCalled());
});

test('ошибка «сделать основным» показана подсказкой', async () => {
  const { repo } = await setup();
  vi.spyOn(repo, 'setPrimaryDistrict').mockRejectedValueOnce(new Error('offline'));
  renderSettings(repo);
  await screen.findByText('Рядом', { exact: false });
  rowOf('Далеко').getByRole('button', { name: /сделать основным/ }).click();
  expect(await screen.findByText('Не получилось. Попробуй ещё раз.')).toBeTruthy();
});

test('создание района: имя + «добавить» → район появляется в списке', async () => {
  const { repo } = await setup();
  renderSettings(repo);
  await screen.findByText('Рядом', { exact: false });
  fireEvent.input(screen.getByLabelText('имя нового района'), {
    target: { value: 'Хамар-Дабан' },
  });
  screen.getByRole('button', { name: /добавить/ }).click();
  await waitFor(async () => {
    const list = await repo.listDistricts();
    expect(list.some((d) => d.name === 'Хамар-Дабан')).toBe(true);
  });
  expect(await screen.findByText('Хамар-Дабан', { exact: false })).toBeTruthy();
});

test('создание района с ошибкой: подсказка, район не появился', async () => {
  const { repo } = await setup();
  vi.spyOn(repo, 'createDistrict').mockRejectedValueOnce(new Error('offline'));
  renderSettings(repo);
  await screen.findByText('Рядом', { exact: false });
  fireEvent.input(screen.getByLabelText('имя нового района'), {
    target: { value: 'Хамар-Дабан' },
  });
  screen.getByRole('button', { name: /добавить/ }).click();
  expect(await screen.findByText('Не получилось. Попробуй ещё раз.')).toBeTruthy();
  expect((await repo.listDistricts()).some((d) => d.name === 'Хамар-Дабан')).toBe(false);
});

test('ошибка переименования показана подсказкой', async () => {
  const { repo } = await setup();
  vi.spyOn(repo, 'renameDistrict').mockRejectedValueOnce(new Error('offline'));
  renderSettings(repo);
  await screen.findByText('Рядом', { exact: false });
  const row = rowOf('Далеко');
  row.getByRole('button', { name: /переименовать/ }).click();
  const input = await waitFor(() => row.getByLabelText('имя района') as HTMLInputElement);
  fireEvent.input(input, { target: { value: 'Совсем далеко' } });
  row.getByRole('button', { name: /готово/ }).click();
  expect(await screen.findByText('Не получилось. Попробуй ещё раз.')).toBeTruthy();
});
