import { Card, Stat } from '../components/ui';
import { formatKRW } from '../domain/money';
import { describeChoices } from '../domain/optimizer';
import type { ShippingGroup } from '../domain/types';
import type { AppData } from '../state/useAppData';

const NAMES: Record<ShippingGroup, string> = {
  rocketFresh: '로켓프레시', rocket: '로켓배송', sellerRocket: '판매자로켓', sellerFree: '판매자 무료배송', none: '기타',
};

export default function Shopping({ data }: { data: AppData }) {
  const byId = new Map(data.foods.map((f) => [f.id, f]));
  const plan = data.plan;
  return (
    <>
      <Card title="다음 장보기 (3일 안에 떨어지는 것, 7일치)">
        <p className="muted">재고는 구매 기록·"지금 재고 맞추기"와 하루 계획량으로 추정해요. 기록이 없는 식품은 재고 0으로 봐요.</p>
        {data.shopping.length === 0 && <p className="muted">3일 안에 떨어지는 식품이 없어요.</p>}
      </Card>
      {data.shopping.map((g) => (
        <Card key={g.group} title={NAMES[g.group]}>
          {g.lines.map((l) => {
            const f = byId.get(l.foodId)!;
            return (
              <Stat
                key={l.foodId}
                label={`${f.name} — ${describeChoices(l.choices)}`}
                value={formatKRW(l.cost)}
                sub={l.daysLeft === 0 ? '재고 없음' : `${l.daysLeft}일 뒤 소진`}
              />
            );
          })}
          <Stat label="합계" value={formatKRW(g.total)} />
          {g.minimum > 0 &&
            (g.belowMinimum ? (
              <p className="warn">최소 주문 {formatKRW(g.minimum)}까지 {formatKRW(g.minimum - g.total)} 부족 — 곧 떨어질 다른 로켓프레시 품목을 같이 담으세요.</p>
            ) : (
              <p className="ok">최소 주문 {formatKRW(g.minimum)} 충족</p>
            ))}
          <div>
            {g.lines.map((l) => {
              const url = byId.get(l.foodId)!.url;
              return url ? (
                <a key={l.foodId} className="btn" style={{ margin: '6px 6px 0 0' }} href={url} target="_blank" rel="noreferrer">
                  {byId.get(l.foodId)!.name.split(' ').slice(0, 2).join(' ')} 열기
                </a>
              ) : null;
            })}
          </div>
        </Card>
      ))}
      <Card title={`이번 예산월 계획 구매 (${data.period.days}일)`}>
        {plan.lines.map((l) => {
          const f = byId.get(l.foodId)!;
          return (
            <Stat
              key={l.foodId}
              label={`${f.name} (${l.needed}${f.unit})`}
              value={l.result ? formatKRW(l.result.cost) : '미입력'}
              sub={l.result ? describeChoices(l.result.choices) : '포장 가격을 입력하세요'}
            />
          );
        })}
        <Stat label="합계" value={formatKRW(plan.total)} />
      </Card>
    </>
  );
}
