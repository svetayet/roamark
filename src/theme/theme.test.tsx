import { render, screen, act } from '@testing-library/react';

import { ThemeProvider, useTheme } from './theme';

function mockMatchMedia(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('dark') ? dark : false,
      media: query,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
        listeners.add(cb),
      removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
        listeners.delete(cb),
    }),
  });
  return {
    fire(nextDark: boolean) {
      dark = nextDark;
      listeners.forEach((cb) => cb({ matches: nextDark }));
    },
  };
}

function Probe() {
  const { pref, setPref, resolved } = useTheme();
  return (
    <div>
      <span data-testid="pref">{pref}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => setPref('dark')}>dark</button>
      <button onClick={() => setPref('system')}>system</button>
    </div>
  );
}

test('по умолчанию system; resolved следует системной теме', () => {
  localStorage.clear();
  mockMatchMedia(false);
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('pref').textContent).toBe('system');
  expect(screen.getByTestId('resolved').textContent).toBe('light');
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
});

test('setPref("dark") ставит data-theme и resolved; system возвращает системную', () => {
  localStorage.clear();
  mockMatchMedia(false);
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  act(() => screen.getByText('dark').click());
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  expect(screen.getByTestId('resolved').textContent).toBe('dark');
  expect(localStorage.getItem('roamark.theme')).toBe('dark');
  act(() => screen.getByText('system').click());
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  expect(screen.getByTestId('resolved').textContent).toBe('light');
});

test('смена системной темы на лету меняет resolved при pref=system', () => {
  localStorage.clear();
  const media = mockMatchMedia(false);
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  act(() => media.fire(true));
  expect(screen.getByTestId('resolved').textContent).toBe('dark');
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
});

test('сохранённая тема читается при новом провайдере', () => {
  localStorage.clear();
  mockMatchMedia(false);
  localStorage.setItem('roamark.theme', 'dark');
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('pref').textContent).toBe('dark');
  expect(screen.getByTestId('resolved').textContent).toBe('dark');
});
