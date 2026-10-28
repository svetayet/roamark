import { render, screen } from '@testing-library/react';
import App from './App';

test('приложение рендерит бренд roaMark', () => {
  render(<App />);
  expect(screen.getByText('roaMark')).toBeInTheDocument();
});
