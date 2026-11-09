import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ensureDefaults } from '../db/backup';
import { db } from '../db/db';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import { rawFixture, SAMPLE_BUDGET } from '../state/testData';
import { deriveAppData } from '../state/useAppData';
import CaptureFlow from './CaptureFlow';
import Diet from './Diet';
import Home from './Home';
import Settings from './Settings';
import Shopping from './Shopping';
import Spend from './Spend';
import Weight from './Weight';

const TODAY = '2026-11-10';
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureDefaults(db);
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => vi.unstubAllGlobals());

describe('Home', () => {
  test('remaining budget, daily allowance, nutrition, backup warning', () => {
    render(<Home data={deriveAppData(rawFixture(SAMPLE_BUDGET), TODAY)} navigate={() => {}} />);
    expect(screen.getByText('1,216,380원')).toBeInTheDocument();
    expect(screen.getByText('40,546원')).toBeInTheDocument();
    expect(screen.getByText(/2,746 \/ 2,800 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/백업한 지 7일이 넘었어요/)).toBeInTheDocument();
  });

  test('missing income shows 미입력 warning; empty budget shows setup prompt', () => {
    render(<Home data={deriveAppData(rawFixture({ incomes: [{ id: 'i', name: '월급', amount: null }] }), TODAY)} navigate={() => {}} />);
    expect(screen.getByText(/미입력: 월급/)).toBeInTheDocument();
    render(<Home data={deriveAppData(rawFixture(), TODAY)} navigate={() => {}} />);
    expect(screen.getByText(/수입·고정비가 아직 없어요/)).toBeInTheDocument();
  });

  test('dinner one-tap writes today', async () => {
    render(<Home data={deriveAppData(rawFixture(), TODAY)} navigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '고기 없음' }));
    await waitFor(async () => expect((await db.dinners.get(TODAY))?.choice).toBe('none'));
  });
});

describe('Diet', () => {
  const data = () => deriveAppData(rawFixture({ finishes: [{ id: 'f', foodId: 'pb', startDate: '2026-10-27', endDate: '2026-11-09', qty: 200 }] }), TODAY);

  test('peanut butter shows measured vs plan', () => {
    render(<Diet data={data()} />);
    expect(screen.getByText(/실측 14.3g\/일 · 계획의 30%/)).toBeInTheDocument();
  });

  test('finished button records a finish event and zeroes stock', async () => {
    render(<Diet data={data()} />);
    fireEvent.click(screen.getByRole('button', { name: '매일바이오 그릭요거트 무가당 플레인 150g 다 먹었음' }));
    fireEvent.change(screen.getByLabelText('먹기 시작한 날'), { target: { value: '2026-10-29' } });
    fireEvent.change(screen.getByLabelText('먹은 양 (개)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '기록' }));
    await waitFor(async () => expect(await db.finishes.where('foodId').equals('yogurt').count()).toBe(1));
    expect((await db.stockEvents.where('foodId').equals('yogurt').first())).toMatchObject({ type: 'adjust', qty: 0 });
  });

  test('editing a pack price saves price and history', async () => {
    render(<Diet data={data()} />);
    fireEvent.click(screen.getByRole('button', { name: '스텔라나 베트남산 바나나 편집' }));
    fireEvent.change(screen.getByLabelText('포장 1 가격'), { target: { value: '3,290' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect((await db.foods.get('banana'))!.packOptions[0].price).toBe(3290));
    expect(await db.prices.where('foodId').equals('banana').count()).toBe(1);
  });
});

describe('Spend', () => {
  const mk = (logScope: 'food' | 'all') => deriveAppData(rawFixture({ settings: { ...DEFAULT_SETTINGS, logScope } }), TODAY);

  test('food-only scope shows only food categories', () => {
    render(<Spend data={mk('food')} />);
    const select = screen.getByLabelText('카테고리');
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['저녁식비', '추가식품']);
  });

  test('manual expense saves integer amount', async () => {
    render(<Spend data={mk('all')} />);
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '12,500' } });
    fireEvent.change(screen.getByLabelText('카테고리'), { target: { value: '여가' } });
    fireEvent.click(screen.getByRole('button', { name: '지출 추가' }));
    await waitFor(async () => expect(await db.expenses.toArray()).toEqual([expect.objectContaining({ amount: 12500, category: '여가' })]));
  });

  test('food purchase form records one 식단 expense and stock', async () => {
    render(<Spend data={mk('food')} />);
    fireEvent.change(screen.getByLabelText('매일바이오 그릭요거트 무가당 플레인 150g 팩 수 (24개)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '식단 구매 기록' }));
    await waitFor(async () => expect(await db.expenses.toArray()).toEqual([expect.objectContaining({ amount: 35760, category: '식단' })]));
    expect(await db.stockEvents.where('foodId').equals('yogurt').first()).toMatchObject({ qty: 24 });
  });

  test('zero amount shows error, saves nothing', async () => {
    render(<Spend data={mk('all')} />);
    fireEvent.click(screen.getByRole('button', { name: '지출 추가' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('금액은 1원 이상');
    expect(await db.expenses.count()).toBe(0);
  });
});

describe('CaptureFlow', () => {
  const mk = (apiKey: string) => deriveAppData(rawFixture({ settings: { ...DEFAULT_SETTINGS, apiKey } }), TODAY);
  const img = () => new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });

  test('no API key → Korean error, nothing saved', async () => {
    render(<CaptureFlow data={mk('')} />);
    fireEvent.change(screen.getByLabelText('캡처 올리기'), { target: { files: [img()] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('API 키를 먼저 입력');
    expect(await db.expenses.count()).toBe(0);
  });

  test('non-JSON answer → error, nothing saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: '못 읽겠어요' }] }), { status: 200 })));
    render(<CaptureFlow data={mk('k')} />);
    fireEvent.change(screen.getByLabelText('캡처 올리기'), { target: { files: [img()] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Claude 답을 이해하지 못했어요');
    expect(await db.expenses.count()).toBe(0);
  });

  test('read → confirm → saves food purchase + leftover as separate expense', async () => {
    const result = {
      kind: 'coupang_order', date: '2026-11-10', merchant: '쿠팡', total: 40760, category: '식단',
      items: [
        { name: '그릭요거트 24개', foodId: 'yogurt', packLabel: '24개', packs: 1, price: 35760 },
        { name: '물티슈', foodId: null, packLabel: null, packs: 1, price: 5000 },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(result) }] }), { status: 200 })));
    render(<CaptureFlow data={mk('k')} />);
    fireEvent.change(screen.getByLabelText('캡처 올리기'), { target: { files: [img()] } });
    expect(await screen.findByText('그릭요거트 24개')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('식단 외 품목 카테고리'), { target: { value: '생활용품' } });
    fireEvent.click(screen.getByRole('button', { name: '이대로 저장' }));
    await waitFor(async () => expect(await db.expenses.count()).toBe(2));
    const ex = await db.expenses.toArray();
    expect(ex).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 35760, category: '식단', source: 'capture' }),
      expect.objectContaining({ amount: 5000, category: '생활용품' }),
    ]));
  });
});

describe('Settings', () => {
  const data = async () => deriveAppData(rawFixture({ settings: (await db.settings.get('settings'))! }), TODAY);

  test('invalid backup file shows Korean error and keeps data', async () => {
    render(<Settings data={await data()} />);
    const file = new File(['{"app":"x"}'], 'bad.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('백업 불러오기 (지금 데이터를 교체)'), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('이 앱의 백업 파일이 아니에요.');
    expect(await db.foods.count()).toBe(8);
  });

  test('seed merge fills incomes', async () => {
    render(<Settings data={await data()} />);
    const seed = { app: 'bulk-ledger', version: 1, data: { incomes: [{ id: 'salary', name: '월급', amount: 3000000 }] } };
    fireEvent.change(screen.getByLabelText('개인 데이터 파일 합치기'), { target: { files: [new File([JSON.stringify(seed)], 's.json')] } });
    await waitFor(async () => expect(await db.incomes.get('salary')).toMatchObject({ amount: 3000000 }));
  });

  test('adding an income with empty amount stores null (미입력)', async () => {
    render(<Settings data={await data()} />);
    fireEvent.change(screen.getByLabelText('새 수입 이름'), { target: { value: '부수입' } });
    fireEvent.click(screen.getByRole('button', { name: '수입 추가' }));
    await waitFor(async () => expect((await db.incomes.toArray())[0]).toMatchObject({ name: '부수입', amount: null }));
  });

  test('API key saved only after explicit 저장', async () => {
    render(<Settings data={await data()} />);
    fireEvent.change(screen.getByLabelText('새 API 키'), { target: { value: '  sk-ant-test  ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect((await db.settings.get('settings'))!.apiKey).toBe('sk-ant-test'));
  });
});

describe('Weight', () => {
  const data = deriveAppData(rawFixture({
    settings: { ...DEFAULT_SETTINGS, weightGoal: { startKg: 70, targetKg: 76, startDate: '2026-11-09', endDate: '2027-02-09' } },
    weights: [{ date: '2026-11-09', kg: 70 }],
  }), TODAY);

  test('logs today weight and rejects nonsense', async () => {
    render(<Weight data={data} />);
    fireEvent.change(screen.getByLabelText('오늘 체중(kg)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('체중 값을 확인해 주세요.');
    fireEvent.change(screen.getByLabelText('오늘 체중(kg)'), { target: { value: '70.3' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect((await db.weights.get(TODAY))?.kg).toBe(70.3));
    expect(screen.getByText(/목표선 70.1kg/)).toBeInTheDocument();
  });
});

describe('Shopping', () => {
  test('empty stock → rocket fresh group meets minimum; plan total shown', () => {
    render(<Shopping data={deriveAppData(rawFixture(), TODAY)} />);
    expect(screen.getByRole('heading', { name: '로켓프레시' })).toBeInTheDocument();
    expect(screen.getByText(/최소 주문 15,000원 충족/)).toBeInTheDocument();
    expect(screen.getByText('283,620원')).toBeInTheDocument();
  });
});
