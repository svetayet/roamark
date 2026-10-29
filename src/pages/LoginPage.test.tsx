import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { RepoProvider } from '../data/RepoContext';
import { InMemoryTrackRepository } from '../data/memory';
import { ThemeProvider } from '../theme/theme';

const { LoginPage } = await import('./LoginPage');

function renderLogin(repo: InstanceType<typeof InMemoryTrackRepository>) {
  return render(
    <ThemeProvider>
      <RepoProvider repo={repo}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div data-testid="home-page" />} />
          </Routes>
        </MemoryRouter>
      </RepoProvider>
    </ThemeProvider>,
  );
}

test('ввод почты → sendMagicLink и экран «Открой письмо»', async () => {
  const repo = new InMemoryTrackRepository(); // без сессии
  const spy = vi.spyOn(repo, 'sendMagicLink');
  renderLogin(repo);
  fireEvent.input(screen.getByLabelText('почта'), { target: { value: 'a@b.ru' } });
  screen.getByRole('button', { name: /войти/i }).click();
  await waitFor(() => expect(spy).toHaveBeenCalledWith('a@b.ru'));
  expect(
    await screen.findByText('Открой письмо — ссылка войдёт в roaMark'),
  ).toBeTruthy();
});

test('если сессия уже есть — сразу на главную', async () => {
  const repo = new InMemoryTrackRepository({ demo: true });
  renderLogin(repo);
  await waitFor(() => expect(screen.getByTestId('home-page')).toBeTruthy());
});

test('ошибка отправки письма показана, форма жива', async () => {
  const repo = new InMemoryTrackRepository();
  vi.spyOn(repo, 'sendMagicLink').mockRejectedValueOnce(new Error('rate limit'));
  renderLogin(repo);
  fireEvent.input(screen.getByLabelText('почта'), { target: { value: 'a@b.ru' } });
  screen.getByRole('button', { name: /войти/i }).click();
  expect(
    await screen.findByText('Не получилось отправить письмо. Попробуй ещё раз.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: /войти/i })).toBeTruthy();
});
