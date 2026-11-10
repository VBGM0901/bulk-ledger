import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('loads defaults, shows tabs, navigates to settings via 더보기', async () => {
  render(<App />);
  expect(screen.getByText('증량 노트')).toBeInTheDocument();
  for (const label of ['홈', '기록', '지출', 'Claude', '더보기']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /오늘 0kcal 먹음/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  fireEvent.click(screen.getByRole('button', { name: '설정' }));
  expect(await screen.findByText('처음 설정')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '더보기' })).toHaveAttribute('aria-current', 'page');
});
