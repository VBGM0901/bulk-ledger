import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { addDays } from '../domain/dates';
import { ensureDefaults } from '../db/backup';
import { db } from '../db/db';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import { rawFixture, SAMPLE_BUDGET } from '../state/testData';
import { deriveAppData } from '../state/useAppData';
import Chat from './Chat';
import Diet from './Diet';
import Home from './Home';
import Settings from './Settings';
import Shopping from './Shopping';
import Spend from './Spend';
import Log from './Log';

const TODAY = '2026-11-10';
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureDefaults(db);
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => vi.unstubAllGlobals());

describe('Home', () => {
  test('remaining budget, daily allowance, nutrition, backup warning', () => {
    render(<Home data={deriveAppData(rawFixture({ ...SAMPLE_BUDGET, weights: [{ date: '2026-11-01', kg: 70 }] }), TODAY)} navigate={() => {}} />);
    expect(screen.getByText('1,200,180원')).toBeInTheDocument();
    expect(screen.getByText('40,006원')).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 2,800 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/계획대로 다 먹으면 2,756kcal/)).toBeInTheDocument();
    expect(screen.getByText(/백업한 지 7일이 넘었어요/)).toBeInTheDocument();
  });

  test('missing income shows 미입력 warning; empty budget shows setup prompt', () => {
    render(<Home data={deriveAppData(rawFixture({ incomes: [{ id: 'i', name: '월급', amount: null }] }), TODAY)} navigate={() => {}} />);
    expect(screen.getByText(/미입력: 월급/)).toBeInTheDocument();
    render(<Home data={deriveAppData(rawFixture(), TODAY)} navigate={() => {}} />);
    expect(screen.getByText(/수입·고정비가 아직 없어요/)).toBeInTheDocument();
  });

  test('today card shows what was actually eaten, and 체크하기 opens the log', () => {
    const nav = vi.fn();
    const d = deriveAppData(rawFixture({ intakes: [{ date: TODAY, meals: {}, items: { 아침: { juice: 0, yogurt: 1, egg: 0 } } }] }), TODAY);
    render(<Home data={d} navigate={nav} />);
    expect(screen.getByText(/135 \/ 2,800 kcal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '체크하기' }));
    expect(nav).toHaveBeenCalledWith('log');
  });
});

describe('Diet', () => {
  const data = () => deriveAppData(rawFixture({ finishes: [{ id: 'f', foodId: 'pb', startDate: '2026-10-27', endDate: '2026-11-09', qty: 200 }] }), TODAY);

  test('peanut butter shows measured vs plan', () => {
    render(<Diet data={data()} />);
    fireEvent.click(screen.getByRole('button', { name: /식품 관리/ }));
    expect(screen.getByText(/실측 14.3g\/일 · 계획의 30%/)).toBeInTheDocument();
  });

  test('finished button records a finish event and zeroes stock', async () => {
    render(<Diet data={data()} />);
    fireEvent.click(screen.getByRole('button', { name: /식품 관리/ }));
    fireEvent.click(screen.getByRole('button', { name: '매일바이오 그릭요거트 무가당 플레인 150g 다 먹었음' }));
    fireEvent.change(screen.getByLabelText('먹기 시작한 날'), { target: { value: '2026-10-29' } });
    fireEvent.change(screen.getByLabelText('먹은 양 (개)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '기록' }));
    await waitFor(async () => expect(await db.finishes.where('foodId').equals('yogurt').count()).toBe(1));
    expect((await db.stockEvents.where('foodId').equals('yogurt').first())).toMatchObject({ type: 'adjust', qty: 0 });
  });

  test('editing a pack price saves price and history', async () => {
    render(<Diet data={data()} />);
    fireEvent.click(screen.getByRole('button', { name: /식품 관리/ }));
    fireEvent.click(screen.getByRole('button', { name: '스텔라나 베트남산 바나나 편집' }));
    fireEvent.change(screen.getByLabelText('포장 1 가격'), { target: { value: '3,290' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect((await db.foods.get('banana'))!.packOptions[0].price).toBe(3290));
    expect(await db.prices.where('foodId').equals('banana').count()).toBe(1);
  });
});

describe('Spend', () => {
  const data = () => deriveAppData(rawFixture({ expenses: [{ id: 'x', date: TODAY, amount: 1500, category: '추가식품', memo: '삼각김밥', source: 'manual' }] }), TODAY);
  const open = () => fireEvent.click(screen.getByRole('button', { name: /직접 입력/ }));

  test('shows this month list with summary; manual forms are folded until opened', () => {
    render(<Spend data={data()} navigate={() => {}} />);
    expect(screen.getByText('삼각김밥')).toBeInTheDocument();
    expect(screen.queryByLabelText('금액')).toBeNull();
    open();
    const select = screen.getByLabelText('카테고리');
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).not.toContain('식단');
  });

  test('chat hint button goes to the Claude tab', () => {
    const nav = vi.fn();
    render(<Spend data={data()} navigate={nav} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude 탭에서 말로 기록/ }));
    expect(nav).toHaveBeenCalledWith('chat');
  });

  test('manual expense saves integer amount', async () => {
    render(<Spend data={data()} navigate={() => {}} />);
    open();
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '12,500' } });
    fireEvent.change(screen.getByLabelText('카테고리'), { target: { value: '여가' } });
    fireEvent.click(screen.getByRole('button', { name: '지출 추가' }));
    await waitFor(async () => expect(await db.expenses.toArray()).toEqual([expect.objectContaining({ amount: 12500, category: '여가' })]));
  });

  test('food purchase form records one 식단 expense and stock', async () => {
    render(<Spend data={data()} navigate={() => {}} />);
    open();
    fireEvent.change(screen.getByLabelText('매일바이오 그릭요거트 무가당 플레인 150g 팩 수 (24개)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '식단 구매 기록' }));
    await waitFor(async () => expect(await db.expenses.toArray()).toEqual([expect.objectContaining({ amount: 35760, category: '식단' })]));
    expect(await db.stockEvents.where('foodId').equals('yogurt').first()).toMatchObject({ qty: 24 });
  });

  test('zero amount shows error, saves nothing', async () => {
    render(<Spend data={data()} navigate={() => {}} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: '지출 추가' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('금액은 1원 이상');
    expect(await db.expenses.count()).toBe(0);
  });
});

describe('Settings', () => {
  const data = async () => deriveAppData(rawFixture({ settings: (await db.settings.get('settings'))! }), TODAY);

  test('invalid backup file shows Korean error and keeps data', async () => {
    render(<Settings data={await data()} />);
    const file = new File(['{"app":"x"}'], 'bad.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('백업 불러오기 (지금 데이터를 교체)'), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('이 앱의 백업 파일이 아니에요.');
    expect(await db.foods.count()).toBe(9);
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

  test('API key saved only after explicit 저장 (connection checked first)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: '확인' }] }), { status: 200 })));
    render(<Settings data={await data()} />);
    fireEvent.change(screen.getByLabelText('새 API 키'), { target: { value: '  sk-ant-test  ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect((await db.settings.get('settings'))!.apiKey).toBe('sk-ant-test'));
  });
});

describe('Log (기록 달력)', () => {
  const data = deriveAppData(rawFixture({
    settings: { ...DEFAULT_SETTINGS, weightGoal: { startKg: 70, targetKg: 76, startDate: '2026-11-09', endDate: '2027-02-09' } },
    weights: [{ date: '2026-11-09', kg: 70 }],
  }), TODAY);

  test('shows month, logs weight for the selected day and rejects nonsense', async () => {
    render(<Log data={data} />);
    expect(screen.getByText('2026년 11월')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^11일/ })).toBeDisabled(); // 미래
    fireEvent.change(screen.getByLabelText('그날 체중(kg)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '체중 저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('체중 값을 확인해 주세요.');
    fireEvent.change(screen.getByLabelText('그날 체중(kg)'), { target: { value: '70.3' } });
    fireEvent.click(screen.getByRole('button', { name: '체중 저장' }));
    await waitFor(async () => expect((await db.weights.get(TODAY))?.kg).toBe(70.3));
    expect(screen.getByText('70.1kg')).toBeInTheDocument();
  });

  test('tapping foods checks only those; 전부 and 전부 다 먹음 work', async () => {
    render(<Log data={data} />);
    fireEvent.click(screen.getByRole('button', { name: '아침 그릭요거트 1개' }));
    await waitFor(async () => expect((await db.intakes.get(TODAY))?.items?.['아침']).toEqual({ juice: 0, yogurt: 1, egg: 0 }));
    fireEvent.click(within(screen.getByRole('region', { name: '점심' })).getByRole('button', { name: '전부' }));
    await waitFor(async () => expect((await db.intakes.get(TODAY))?.meals['점심']).toBe('all'));
    fireEvent.click(screen.getByRole('button', { name: '전부 다 먹음' }));
    await waitFor(async () => expect(Object.values((await db.intakes.get(TODAY))?.meals ?? {})).toEqual(DEFAULT_SETTINGS.meals.map(() => 'all')));
  });

  test('a logged day shows its percent on the calendar', () => {
    const d = deriveAppData(rawFixture({ intakes: [{ date: '2026-11-09', meals: Object.fromEntries(DEFAULT_SETTINGS.meals.map((m) => [m.name, 'all'])) }] }), TODAY);
    render(<Log data={d} />);
    expect(screen.getByRole('button', { name: /^9일 식사 98% 잘 먹음/ })).toBeInTheDocument();
  });
});

describe('Shopping', () => {
  test('empty stock → rocket fresh group meets minimum; plan total shown', () => {
    render(<Shopping data={deriveAppData(rawFixture(), TODAY)} />);
    expect(screen.getByRole('heading', { name: '로켓프레시' })).toBeInTheDocument();
    expect(screen.getByText(/최소 주문 15,000원 충족/)).toBeInTheDocument();
    expect(screen.getByText('299,820원')).toBeInTheDocument();
  });
});

describe('Chat (대화방)', () => {
  test('without API key: asks to set the key, input disabled', () => {
    render(<Chat data={deriveAppData(rawFixture(), TODAY)} navigate={() => {}} />);
    expect(screen.getByText(/먼저 Claude API 키를 넣어 주세요/)).toBeInTheDocument();
    expect(screen.getByLabelText('메시지')).toBeDisabled();
  });

  test('sends, saves both messages, and keeps them after re-render', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: '잘 먹고 있어요' }] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const data = deriveAppData(rawFixture({ settings: { ...DEFAULT_SETTINGS, apiKey: 'sk-test' } }), TODAY);
    const { unmount } = render(<Chat data={data} navigate={() => {}} />);
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '나 잘 먹고 있어?' } });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(await screen.findByText('잘 먹고 있어요')).toBeInTheDocument();
    expect((await db.chats.orderBy('at').toArray()).map((m) => m.role)).toEqual(['user', 'assistant']);
    unmount();
    render(<Chat data={data} navigate={() => {}} />);
    expect(await screen.findByText('나 잘 먹고 있어?')).toBeInTheDocument();
  });

  test('failed call removes the question and puts it back in the input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const data = deriveAppData(rawFixture({ settings: { ...DEFAULT_SETTINGS, apiKey: 'sk-bad' } }), TODAY);
    render(<Chat data={data} navigate={() => {}} />);
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '안녕' } });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await db.chats.count()).toBe(0);
    expect(screen.getByLabelText('메시지')).toHaveValue('안녕');
  });
});

describe('Log 추가 음식', () => {
  test('only yogurt checked → yogurt kcal counted', () => {
    const d = deriveAppData(rawFixture({ intakes: [{ date: TODAY, meals: {}, items: { 아침: { juice: 0, yogurt: 1, egg: 0 } } }] }), TODAY);
    render(<Log data={d} />);
    expect(within(screen.getByRole('region', { name: '아침' })).getByText('135')).toBeInTheDocument();
  });

  test('adds a custom extra food', async () => {
    render(<Log data={deriveAppData(rawFixture(), TODAY)} />);
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '삼각김밥' } });
    fireEvent.change(screen.getByLabelText('칼로리(kcal)'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: '넣기' }));
    await waitFor(async () => expect((await db.intakes.get(TODAY))?.extras?.[0]).toMatchObject({ name: '삼각김밥', kcal: 200, protein: 0 }));
  });
});

describe('Chat 키 입력칸', () => {
  test('valid key: checks the connection, then saves', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: '확인' }] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    render(<Chat data={deriveAppData(rawFixture(), TODAY)} navigate={() => {}} />);
    fireEvent.change(screen.getByLabelText('Claude API 키'), { target: { value: ' sk-ant-test-key ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect((await db.settings.get('settings'))?.apiKey).toBe('sk-ant-test-key'));
    expect(f.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-test-key');
  });

  test('rejected key is not saved; wrong format is caught before sending', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', f);
    render(<Chat data={deriveAppData(rawFixture(), TODAY)} navigate={() => {}} />);
    fireEvent.change(screen.getByLabelText('Claude API 키'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('sk-ant-');
    expect(f).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Claude API 키'), { target: { value: 'sk-ant-bad' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText(/연결이 안 돼요/)).toBeInTheDocument();
    expect((await db.settings.get('settings'))?.apiKey).toBe('');
  });
});

describe('검수 후 추가 기능', () => {
  const allMeals = Object.fromEntries(DEFAULT_SETTINGS.meals.map((m) => [m.name, 'all' as const]));

  test('home shows this week stamps (Mon~Sun) with good days counted', () => {
    // 2026-11-10은 화요일 → 월(11-09)·화(11-10)
    const d = deriveAppData(rawFixture({ intakes: [{ date: '2026-11-09', meals: allMeals }] }), TODAY);
    render(<Home data={d} navigate={() => {}} />);
    expect(screen.getByRole('button', { name: /이번 주 잘 먹은 날 1일/ })).toBeInTheDocument();
  });

  test('"어제처럼" copies the previous day meal checks', async () => {
    await db.intakes.put({ date: '2026-11-09', meals: { 아침: 'all' }, items: { 점심: { rice: 1, egg: 0 } } });
    render(<Log data={deriveAppData(rawFixture(), TODAY)} />);
    fireEvent.click(screen.getByRole('button', { name: '어제처럼' }));
    await waitFor(async () => expect(await db.intakes.get(TODAY)).toMatchObject({ meals: { 아침: 'all' }, items: { 점심: { rice: 1, egg: 0 } } }));
  });

  test('"어제처럼" with no record yesterday says so', async () => {
    render(<Log data={deriveAppData(rawFixture(), TODAY)} />);
    fireEvent.click(screen.getByRole('button', { name: '어제처럼' }));
    expect(await screen.findByText('전날 기록이 없어요.')).toBeInTheDocument();
  });
});

describe('지출 달력', () => {
  const ex = (id: string, date: string, amount: number, memo: string) => ({ id, date, amount, category: '추가식품' as const, memo, source: 'manual' as const });
  const d = () => deriveAppData(rawFixture({ ...SAMPLE_BUDGET, expenses: [ex('a', '2026-11-10', 1500, '삼각김밥'), ex('b', '2026-11-03', 2000, '음료'), ex('c', '2026-10-20', 3000, '지난달 간식')] }), TODAY);

  test('tapping a day shows only that day; tapping again shows the whole month', () => {
    render(<Spend data={d()} navigate={() => {}} />);
    expect(screen.getByText('삼각김밥')).toBeInTheDocument();
    expect(screen.getByText('음료')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^10일 1500원/ }));
    expect(screen.queryByText('음료')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '11월 전체' }));
    expect(screen.getByText('음료')).toBeInTheDocument();
  });

  test('previous month can be opened to find and delete old entries', () => {
    render(<Spend data={d()} navigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
    expect(screen.getByText('2026년 10월 지출')).toBeInTheDocument();
    expect(screen.getByText('지난달 간식')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2026-10-20 추가식품 3000원 삭제/ })).toBeInTheDocument();
  });

  test('past days with no extra spending get a no-spend stamp', () => {
    render(<Spend data={d()} navigate={() => {}} />);
    expect(screen.getByRole('button', { name: /^4일 무지출/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^11일$/ })).toBeDisabled(); // 미래
  });
});

describe('주간 체크인', () => {
  const goal = { startKg: 70, targetKg: 76, startDate: '2026-10-20', endDate: '2027-01-20' };
  const flat = Array.from({ length: 21 }, (_, i) => ({ date: addDays('2026-10-20', i), kg: 70 }));
  const all = Object.fromEntries(DEFAULT_SETTINGS.meals.map((m) => [m.name, 'all' as const]));
  const intakes = Array.from({ length: 7 }, (_, i) => ({ date: addDays(TODAY, -(i + 1)), meals: all }));

  test('too few records in the last 7 days → no card', () => {
    render(<Home data={deriveAppData(rawFixture({ weights: [{ date: '2026-11-09', kg: 54 }], intakes: intakes.slice(0, 2) }), TODAY)} navigate={() => {}} />);
    expect(screen.queryByRole('region', { name: '주간 체크인' })).toBeNull();
  });

  test('2 weeks flat while eating everything → +250 button raises the target once', async () => {
    await db.settings.update('settings', { weightGoal: goal });
    const d = deriveAppData(rawFixture({ settings: { ...DEFAULT_SETTINGS, weightGoal: goal }, weights: flat, intakes }), TODAY);
    render(<Home data={d} navigate={() => {}} />);
    const card = screen.getByRole('region', { name: '주간 체크인' });
    expect(within(card).getByText('7/7')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: '목표 +250kcal' }));
    await waitFor(async () => expect((await db.settings.get('settings'))!.kcalTarget).toBe(3050));
    expect((await db.settings.get('settings'))!.checkins?.[0]).toMatchObject({ week: '2026-11-09', choice: 'apply', delta: 250 });
  });

  test('"유지" keeps the target and records the week', async () => {
    const d = deriveAppData(rawFixture({ settings: { ...DEFAULT_SETTINGS, weightGoal: goal }, weights: flat, intakes }), TODAY);
    render(<Home data={d} navigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '이번 주는 유지' }));
    await waitFor(async () => expect((await db.settings.get('settings'))!.checkins?.[0]?.choice).toBe('keep'));
    expect((await db.settings.get('settings'))!.kcalTarget).toBe(2800);
  });

  test('after this week is done the card is gone (or shows the new target if applied)', () => {
    const settings = { ...DEFAULT_SETTINGS, kcalTarget: 3050, weightGoal: goal, checkins: [{ week: '2026-11-09', choice: 'apply' as const, delta: 250, kcalAfter: 3050, at: '' }] };
    render(<Home data={deriveAppData(rawFixture({ settings, weights: flat, intakes }), TODAY)} navigate={() => {}} />);
    expect(screen.queryByRole('region', { name: '주간 체크인' })).toBeNull();
    expect(screen.getByText(/이번 주 목표: 3,050kcal/)).toBeInTheDocument();
  });
});

describe('홈 바로 입력', () => {
  test('weight: type a number and 저장 saves today', async () => {
    const d = deriveAppData(rawFixture({ weights: [{ date: '2026-11-09', kg: 54 }] }), TODAY);
    render(<Home data={d} navigate={() => {}} />);
    expect(screen.queryByRole('button', { name: /0.1kg/ })).toBeNull(); // ± 버튼 없음
    fireEvent.change(screen.getByLabelText('오늘 체중(kg)'), { target: { value: '54.2' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect((await db.weights.get(TODAY))?.kg).toBe(54.2));
  });

  test('salary: typing on home updates the first income (or creates 월급)', async () => {
    render(<Home data={deriveAppData(rawFixture(), TODAY)} navigate={() => {}} />);
    const f = screen.getByLabelText('월급');
    fireEvent.change(f, { target: { value: '2,100,000' } });
    fireEvent.blur(f);
    await waitFor(async () => expect((await db.incomes.toArray())[0]).toMatchObject({ name: '월급', amount: 2_100_000 }));
  });
});

describe('고치기 · 자주 쓰는 것', () => {
  const ex = (id: string, date: string, amount: number, memo: string) => ({ id, date, amount, category: '추가식품' as const, memo, source: 'manual' as const });

  test('frequent expense chip records today with undo', async () => {
    const d = deriveAppData(rawFixture({ expenses: [ex('a', '2026-11-08', 1500, '삼각김밥'), ex('b', '2026-11-09', 1500, '삼각김밥')] }), TODAY);
    render(<Spend data={d} navigate={() => {}} />);
    fireEvent.click(within(screen.getByRole('region', { name: '자주 쓰는 지출' })).getByRole('button', { name: /삼각김밥/ }));
    await waitFor(async () => expect(await db.expenses.where('date').equals(TODAY).count()).toBe(1));
    fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }));
    await waitFor(async () => expect(await db.expenses.where('date').equals(TODAY).count()).toBe(0));
  });

  test('tapping an expense row edits amount, memo, category', async () => {
    await db.expenses.put(ex('z', TODAY, 1500, '삼각김밥'));
    const d = deriveAppData(rawFixture({ expenses: [ex('z', TODAY, 1500, '삼각김밥')] }), TODAY);
    render(<Spend data={d} navigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '삼각김밥 1500원 고치기' }));
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '1,800' } });
    fireEvent.change(screen.getByLabelText('카테고리'), { target: { value: '여가' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect(await db.expenses.get('z')).toMatchObject({ amount: 1800, category: '여가' }));
  });

  test('food purchase edit changes amount only and keeps the purchase total in sync', async () => {
    const { recordPurchase, updateExpense } = await import('../db/actions');
    const { expenseId } = await recordPurchase(db, { date: TODAY, lines: [{ foodId: 'banana', packLabel: '1송이(≈5개)', packs: 1, qtyAdded: 5, price: 2990 }] });
    await updateExpense(db, expenseId, { amount: 3500, date: '2026-11-01' });
    expect(await db.expenses.get(expenseId)).toMatchObject({ amount: 3500, date: TODAY });
    expect((await db.purchases.toArray())[0].total).toBe(3500);
  });

  test('extra food: frequent chip adds, row tap edits', async () => {
    const past = ['2026-11-07', '2026-11-08'].map((date, i) => ({ date, meals: {}, extras: [{ id: `p${i}`, name: '라면', kcal: 500, protein: 10 }] }));
    render(<Log data={deriveAppData(rawFixture({ intakes: past }), TODAY)} />);
    fireEvent.click(within(screen.getByRole('region', { name: '추가로 먹은 것' })).getByRole('button', { name: /라면/ }));
    await waitFor(async () => expect((await db.intakes.get(TODAY))?.extras?.[0]).toMatchObject({ name: '라면', kcal: 500 }));
    const { updateExtra } = await import('../db/actions');
    const id = (await db.intakes.get(TODAY))!.extras![0].id;
    await updateExtra(db, TODAY, id, { kcal: 550 });
    expect((await db.intakes.get(TODAY))!.extras![0].kcal).toBe(550);
  });
});
