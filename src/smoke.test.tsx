import { render, screen } from '@testing-library/react';
import App from './App';

test('приложение сразу открывает библиотеку — без экрана входа', async () => {
  render(<App />);
  // Репозиторий по умолчанию — локальный (IndexedDB), никакой почты и паролей.
  // Бренд — знак, что мы на главной; поля для емейла на экране нет.
  const brand = await screen.findByText('roa', { exact: false });
  expect(brand.closest('.home__brand')?.textContent).toBe('roaMark');
  expect(screen.queryByLabelText(/почт/i)).toBeNull();
  expect(screen.queryByRole('button', { name: /войти|отправить ссылку/i })).toBeNull();
});
