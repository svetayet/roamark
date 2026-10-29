import { render } from '@testing-library/react';
import { ThemeProvider } from '../theme/theme';
import { MapView } from './MapView';

test('мини-карта (attribution=false) не рисует плашку атрибуции', () => {
  const { container } = render(
    <ThemeProvider>
      <MapView segments={[]} interactive={false} attribution={false} />
    </ThemeProvider>,
  );
  expect(container.querySelector('.leaflet-control-attribution')).toBeNull();
});

test('обычная карта показывает плашку атрибуции', () => {
  const { container } = render(
    <ThemeProvider>
      <MapView segments={[]} />
    </ThemeProvider>,
  );
  expect(container.querySelector('.leaflet-control-attribution')).toBeTruthy();
});
