import type { InventoryItem } from "@fridgy/shared";
import { CategoryIcon } from "./CategoryIcon";
import { daysLeft, expiryLevel, ddayLabel, LEVEL_COLOR } from "./expiry";

/* 시그니처 패턴: "냉장고 안의 재고"
 * 재고 아이템을 냉장실 선반 / 야채칸 / 냉동실에 클린 타일로 배치한다.
 * 표현 전용 — 선택/액션은 부모(InventoryScreen)가 처리. */

interface FridgeViewProps {
  items: InventoryItem[];
  selectedId?: string | null;
  onSelect: (item: InventoryItem) => void;
}

const byUrgency = (a: InventoryItem, b: InventoryItem) => {
  const da = daysLeft(a.expireAt);
  const db = daysLeft(b.expireAt);
  if (da === null) return db === null ? 0 : 1;
  if (db === null) return -1;
  return da - db;
};

/** 선반 위 한 칸: 카테고리 아이콘 + 상태 dot + 이름 + D-day */
function ItemCell({
  item,
  selected,
  onSelect,
}: {
  item: InventoryItem;
  selected: boolean;
  onSelect: (i: InventoryItem) => void;
}) {
  const level = expiryLevel(item.expireAt);
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-label={`${item.name}, ${ddayLabel(item.expireAt)}`}
      aria-pressed={selected}
      className={[
        "press group relative flex w-[76px] shrink-0 cursor-pointer flex-col items-center gap-1 rounded-lg p-2",
        "border transition-colors",
        selected
          ? "border-brand bg-brand-50 ring-2 ring-brand"
          : "border-transparent bg-white/70 hover:bg-white",
      ].join(" ")}
    >
      {/* 상태 dot */}
      <span
        className={[
          "absolute right-1.5 top-1.5 z-10 h-2.5 w-2.5 rounded-full ring-2 ring-white",
          level === "urgent" ? "pulse-urgent" : "",
        ].join(" ")}
        style={{ backgroundColor: LEVEL_COLOR[level] }}
      />
      <CategoryIcon category={item.category} size={26} chipSize={44} title={item.name} />
      <span className="mt-0.5 max-w-full truncate text-[12px] font-medium leading-tight text-ink">
        {item.name}
      </span>
      <span
        className="tnum text-[11px] font-semibold leading-none"
        style={{ color: LEVEL_COLOR[level] }}
      >
        {ddayLabel(item.expireAt)}
      </span>
    </button>
  );
}

/** 존(구역) — 라벨 + 틴트 내부 + 아이템 타일 그리드 + 하단 선반 라인 */
function Zone({
  label,
  items,
  tint,
  selectedId,
  onSelect,
}: {
  label: string;
  items: InventoryItem[];
  tint: string;
  selectedId?: string | null;
  onSelect: (i: InventoryItem) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-steel-dark">
          {label}
        </span>
        <span className="tnum text-[11px] font-medium text-ink-faint">{items.length}</span>
      </div>
      <div className={["mx-2 mb-2 rounded-lg px-1.5 py-1.5", tint].join(" ")}>
        {items.length === 0 ? (
          <p className="py-3 text-center text-xs text-ink-faint">비어 있어요</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {items.map((it) => (
              <ItemCell
                key={it.id}
                item={it}
                selected={selectedId === it.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function FridgeView({ items, selectedId, onSelect }: FridgeViewProps) {
  const freezer = items.filter((i) => i.category === "냉동식품").sort(byUrgency);
  const veg = items
    .filter((i) => i.category === "채소" || i.category === "과일")
    .sort(byUrgency);
  const fresh = items
    .filter(
      (i) =>
        i.category !== "냉동식품" && i.category !== "채소" && i.category !== "과일"
    )
    .sort(byUrgency);

  // 한 눈에 보는 요약: 임박·긴급 개수
  const urgentCount = items.filter((i) => expiryLevel(i.expireAt) === "urgent").length;
  const soonCount = items.filter((i) => expiryLevel(i.expireAt) === "soon").length;

  return (
    // 냉장고 본체
    <div className="overflow-hidden rounded-2xl border border-steel-line bg-steel shadow-md">
      {/* 상단 컨트롤 스트립: 온도 + 한눈 요약 */}
      <div className="flex items-center justify-between gap-2 border-b border-steel-line bg-white/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-frost-cool ring-1 ring-steel-line" />
          <span className="text-sm font-semibold text-ink">내 냉장고</span>
          <span className="tnum ml-1 rounded-full bg-frost-100 px-1.5 py-0.5 text-[11px] font-medium text-steel-dark">
            3°C
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {urgentCount > 0 && (
            <span className="tnum inline-flex items-center gap-1 rounded-full bg-urgent-tint px-2 py-0.5 text-[11px] font-semibold text-[#B91C1C]">
              <span className="h-1.5 w-1.5 rounded-full bg-urgent" />긴급 {urgentCount}
            </span>
          )}
          {soonCount > 0 && (
            <span className="tnum inline-flex items-center gap-1 rounded-full bg-soon-tint px-2 py-0.5 text-[11px] font-semibold text-[#B45309]">
              <span className="h-1.5 w-1.5 rounded-full bg-soon" />임박 {soonCount}
            </span>
          )}
          {urgentCount === 0 && soonCount === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-fresh-tint px-2 py-0.5 text-[11px] font-semibold text-brand-600">
              <span className="h-1.5 w-1.5 rounded-full bg-fresh" />모두 신선
            </span>
          )}
        </div>
      </div>

      {/* 냉장고 내부 (냉기 톤) */}
      <div className="bg-frost-50 pb-2">
        <Zone
          label="냉장실"
          items={fresh}
          tint="bg-white/50"
          selectedId={selectedId}
          onSelect={onSelect}
        />
        <Zone
          label="야채칸"
          items={veg}
          tint="bg-brand-50"
          selectedId={selectedId}
          onSelect={onSelect}
        />
        <Zone
          label="냉동실"
          items={freezer}
          tint="bg-frost-cool"
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
