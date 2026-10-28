import { render, screen } from '@testing-library/react';
import App from './App';

test('приложение рендерит бренд roaMark', async () => {
  render(<App />);
  // Репозиторий по умолчанию — демо, вход уже есть; ждём асинхронный гейт.
  expect(await screen.findByText('roaMark')).toBeInTheDocument();
});
