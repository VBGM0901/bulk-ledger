import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('loads defaults, shows tabs, navigates to settings via 더보기', async () => {
  render(<App />);
  expect(screen.getByText('증량 가계부')).toBeInTheDocument();
  for (const label of ['홈', '식단', '지출', '체중', '더보기']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  expect(await screen.findByText(/수입·고정비가 아직 없어요/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  fireEvent.click(screen.getByRole('button', { name: '설정' }));
  expect(await screen.findByText('처음 설정')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '더보기' })).toHaveAttribute('aria-current', 'page');
});
