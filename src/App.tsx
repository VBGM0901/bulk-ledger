import { CalendarDays, ChevronLeft, Home as HomeIcon, Menu, Salad, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppData } from './state/useAppData';
import Chat from './screens/Chat';
import Diet from './screens/Diet';
import Home from './screens/Home';
import More from './screens/More';
import Report from './screens/Report';
import SettingsScreen from './screens/Settings';
import Shopping from './screens/Shopping';
import Spend from './screens/Spend';
import Log from './screens/Log';

export type Screen = 'home' | 'diet' | 'log' | 'spend' | 'more' | 'shopping' | 'report' | 'chat' | 'settings';

const TABS: { id: Screen; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'home', label: '홈', Icon: HomeIcon },
  { id: 'diet', label: '식단', Icon: Salad },
  { id: 'log', label: '기록', Icon: CalendarDays },
  { id: 'spend', label: '지출', Icon: Wallet },
  { id: 'more', label: '더보기', Icon: Menu },
];
const SUB: Partial<Record<Screen, string>> = { shopping: '장보기', report: '월별 리포트', chat: 'Claude', settings: '설정' };

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const data = useAppData();
  const theme = data?.settings.theme ?? 'system';

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && Boolean(mq?.matches));
      document.documentElement.dataset.moluTheme = dark ? 'dark' : 'light';
    };
    apply();
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [theme]);

  const navigate = (s: Screen) => {
    setScreen(s);
    window.scrollTo?.({ top: 0 });
  };
  const active: Screen = SUB[screen] ? 'more' : screen;

  return (
    <div className="app">
      <header className="app-header">
        {SUB[screen] ? (
          <button className="btn" onClick={() => navigate('more')} aria-label="더보기로 돌아가기">
            <ChevronLeft size={18} aria-hidden /> {SUB[screen]}
          </button>
        ) : (
          <span className="brand">증량 가계부</span>
        )}
        {data && <span className="screen-title">{data.today.replaceAll('-', '. ')}</span>}
      </header>
      <main>
        {!data ? (
          <p className="muted">불러오는 중…</p>
        ) : (
          <>
            {screen === 'home' && <Home data={data} navigate={navigate} />}
            {screen === 'diet' && <Diet data={data} />}
            {screen === 'spend' && <Spend data={data} />}
            {screen === 'log' && <Log data={data} />}
            {screen === 'more' && <More navigate={navigate} />}
            {screen === 'shopping' && <Shopping data={data} />}
            {screen === 'report' && <Report data={data} />}
            {screen === 'chat' && <Chat data={data} />}
            {screen === 'settings' && <SettingsScreen data={data} />}
          </>
        )}
      </main>
      <nav className="tabbar" aria-label="주 메뉴">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} aria-current={active === id ? 'page' : undefined} onClick={() => navigate(id)}>
            <Icon size={22} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
