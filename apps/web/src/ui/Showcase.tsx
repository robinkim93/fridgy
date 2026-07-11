import { useState } from "react";
import type { InventoryItem, ItemCategory } from "@fridgy/shared";
import { CategoryIcon } from "./CategoryIcon";
import { FridgeView } from "./FridgeView";
import { Button, Card, ExpiryBadge, Tag } from "./primitives";
import { AppShell, type TabKey } from "./AppShell";
import { ActiveFridgeProvider } from "../features/fridge/useActiveFridge";

/* 살아있는 스타일 가이드. 인증 없이 확인: /?showcase
 * 프로덕션 번들에는 영향 없음(진입 게이트는 main.tsx). */

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const CATS: ItemCategory[] = [
  "유제품", "육류", "수산물", "채소", "과일",
  "냉동식품", "가공식품", "통조림", "음료", "기타",
];

const mock: InventoryItem[] = [
  ["우유", "유제품", -1, 1, "L"],
  ["삼겹살", "육류", 0, 500, "g"],
  ["고등어", "수산물", 2, 2, "손"],
  ["두부", "가공식품", 4, 1, "모"],
  ["참치캔", "통조림", 200, 3, "개"],
  ["콜라", "음료", 90, 1, "병"],
  ["양배추", "채소", 3, 1, "통"],
  ["사과", "과일", 12, 5, "개"],
  ["만두", "냉동식품", 120, 1, "봉"],
  ["아이스크림", "냉동식품", 60, 4, "개"],
].map(([name, category, dd, qty, unit], i) => ({
  id: `mock-${i}`,
  fridgeId: "demo",
  name: name as string,
  category: category as ItemCategory,
  qty: qty as number,
  unit: unit as string,
  purchasedAt: iso(-3),
  expireAt: iso(dd as number),
  source: "manual",
  status: "active",
}));

const SWATCHES: [string, string][] = [
  ["canvas", "#f6f9f8"], ["surface", "#ffffff"], ["ink", "#0f172a"],
  ["brand", "#059669"], ["accent", "#d97706"], ["fresh", "#059669"],
  ["soon", "#f59e0b"], ["urgent", "#ef4444"], ["frost", "#e7f0f4"],
  ["steel", "#e2e8ec"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="border-b border-line pb-1 text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** GNB 셸 데모 — 진입 즉시 냉장고, 하단 탭 전환. (?showcase=shell) */
function ShellDemo() {
  const [tab, setTab] = useState<TabKey>("home");
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  return (
    <ActiveFridgeProvider>
      <AppShell activeTab={tab} onTab={setTab} onManageFridge={() => {}}>
        {tab === "home" && (
          <div className="flex flex-col gap-4">
            <Button variant="primary" block className="py-3.5">
              영수증으로 담기
            </Button>
            <FridgeView items={mock} selectedId={selected?.id} onSelect={setSelected} />
          </div>
        )}
        {tab !== "home" && (
          <Card className="p-6 text-center">
            <p className="text-lg font-bold text-ink">{tab}</p>
            <p className="mt-2 text-ink-soft">실제 데이터 화면(데모 생략)</p>
          </Card>
        )}
      </AppShell>
    </ActiveFridgeProvider>
  );
}

export function Showcase() {
  const [selected, setSelected] = useState<InventoryItem | null>(null);

  if (new URLSearchParams(window.location.search).get("showcase") === "shell") {
    return <ShellDemo />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 bg-canvas px-5 py-8">
      <header className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-brand-600">Fridgy</h1>
        <p className="mt-2 text-ink-soft">Fresh Pantry 디자인 시스템</p>
      </header>

      <Section title="컬러 토큰">
        <div className="grid grid-cols-5 gap-2">
          {SWATCHES.map(([name, hex]) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <div
                className="h-11 w-11 rounded-md border border-line shadow-sm"
                style={{ backgroundColor: hex }}
              />
              <span className="text-center text-[10px] leading-tight text-ink-soft">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="타이포그래피">
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-2xl font-extrabold text-ink">Fridgy 12345</p>
          <p className="text-lg font-bold text-ink">Pretendard Bold · 제목/헤딩</p>
          <p className="font-semibold text-ink-soft">Pretendard SemiBold · 라벨·버튼</p>
          <hr className="border-line" />
          <p className="text-ink">Pretendard · 본문·소비기한 목록 가독성 우선</p>
          <p className="tnum text-sm text-ink-soft">등폭 숫자 0123456789 · D-7 · ₩12,400</p>
        </Card>
      </Section>

      <Section title="버튼 · 뱃지">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">기본 액션</Button>
          <Button>보조</Button>
          <Button variant="subtle">서브</Button>
          <Button variant="danger">폐기</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExpiryBadge expireAt={iso(9)} />
          <ExpiryBadge expireAt={iso(3)} />
          <ExpiryBadge expireAt={iso(0)} />
          <ExpiryBadge expireAt={iso(-2)} />
          <ExpiryBadge expireAt={null} />
          <Tag>채소</Tag>
        </div>
      </Section>

      <Section title="카테고리 아이콘 (10종)">
        <Card className="grid grid-cols-5 gap-3 p-4">
          {CATS.map((c) => (
            <div key={c} className="flex flex-col items-center gap-1.5">
              <CategoryIcon category={c} size={26} chipSize={44} />
              <span className="text-[10px] text-ink-soft">{c}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="시그니처 · 냉장고 안의 재고">
        <FridgeView items={mock} selectedId={selected?.id} onSelect={setSelected} />
        {selected && (
          <Card raised className="flex items-center gap-3 p-3">
            <CategoryIcon category={selected.category} size={26} chipSize={44} />
            <div className="flex-1">
              <p className="font-bold text-ink">{selected.name}</p>
              <ExpiryBadge expireAt={selected.expireAt} />
            </div>
            <Button variant="subtle" className="min-h-0 px-3 py-1.5 text-sm" onClick={() => setSelected(null)}>
              닫기
            </Button>
          </Card>
        )}
      </Section>
    </main>
  );
}
