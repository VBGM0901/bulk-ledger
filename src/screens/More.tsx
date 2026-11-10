import { Bot, ChartPie, Salad, Settings as Cog, ShoppingCart } from 'lucide-react';
import type { Screen } from '../App';

const ITEMS: { id: Screen; label: string; Icon: typeof Bot }[] = [
  { id: 'diet', label: '식단 계획 · 식품 가격', Icon: Salad },
  { id: 'shopping', label: '장보기', Icon: ShoppingCart },
  { id: 'report', label: '월별 리포트', Icon: ChartPie },
  { id: 'settings', label: '설정', Icon: Cog },
];

export default function More({ navigate }: { navigate: (s: Screen) => void }) {
  return (
    <section className="card">
      {ITEMS.map(({ id, label, Icon }) => (
        <button key={id} className="btn block" onClick={() => navigate(id)}>
          <Icon size={20} aria-hidden /> {label}
        </button>
      ))}
    </section>
  );
}
