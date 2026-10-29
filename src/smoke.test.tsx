import { render, screen } from '@testing-library/react';
import App from './App';

test('приложение рендерит бренд roaMark', async () => {
  render(<App />);
  // Репозиторий по умолчанию — демо, вход уже есть; ждём асинхронный гейт.
  // Бренд теперь знак: плитка + «roa|M|ark» в разных спанах.
  const brand = await screen.findByText('roa', { exact: false });
  expect(brand.closest('.home__brand')?.textContent).toBe('roaMark');
});
