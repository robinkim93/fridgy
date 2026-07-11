import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InventoryItem } from "@fridgy/shared";
import { consumeItems, getInventory, setExpiryOverride } from "../../lib/api";
import { track } from "../../lib/track";
import { useActiveFridge } from "../fridge/useActiveFridge";
import { FridgeView } from "../../ui/FridgeView";
import { CategoryIcon } from "../../ui/CategoryIcon";
import { Button, Card, ExpiryBadge, Tag } from "../../ui/primitives";
import { daysLeft } from "../../ui/expiry";

interface InventoryScreenProps {
  onAddReceipt: () => void;
}

type ViewMode = "fridge" | "list";

export function InventoryScreen({ onAddReceipt }: InventoryScreenProps) {
  const queryClient = useQueryClient();
  const { activeFridgeId } = useActiveFridge();
  const [view, setView] = useState<ViewMode>("fridge");
  const [selected, setSelected] = useState<InventoryItem | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inventory", activeFridgeId],
    queryFn: () => getInventory(activeFridgeId),
    retry: false,
  });

  const override = useMutation({
    mutationFn: ({ name, days }: { name: string; days: number }) =>
      setExpiryOverride(name, days, activeFridgeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", activeFridgeId] }),
  });

  const consume = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "consumed" | "discarded" }) =>
      consumeItems([id], action, activeFridgeId),
    onSuccess: (_data, { action }) => {
      if (action === "discarded") track("item_discarded", {});
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["inventory", activeFridgeId] });
      queryClient.invalidateQueries({ queryKey: ["recipes", activeFridgeId] });
    },
  });

  const handleAdjust = (item: InventoryItem) => {
    const cur = daysLeft(item.expireAt);
    const input = window.prompt(
      `"${item.name}"의 소비기한을 며칠로 설정할까요? (구매일 기준 일수)`,
      cur !== null && cur > 0 ? String(cur) : "7"
    );
    if (input === null) return;
    const days = Number(input);
    if (!Number.isFinite(days) || days <= 0) {
      window.alert("1 이상의 숫자를 입력하세요.");
      return;
    }
    override.mutate({ name: item.name, days });
  };

  const busy = consume.isPending || override.isPending;

  return (
    <div className="flex flex-col gap-4">
      {/* 담기 CTA */}
      <Button variant="primary" block onClick={onAddReceipt} className="py-3.5">
        영수증으로 담기
      </Button>

      {/* 뷰 토글 (세그먼트) */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setView("fridge")}
          className={[
            "press flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
            view === "fridge" ? "bg-surface text-brand-600 shadow-sm" : "text-ink-soft",
          ].join(" ")}
        >
          냉장고 보기
        </button>
        <button
          type="button"
          onClick={() => setView("list")}
          className={[
            "press flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
            view === "list" ? "bg-surface text-brand-600 shadow-sm" : "text-ink-soft",
          ].join(" ")}
        >
          목록 보기
        </button>
      </div>

      {isLoading && (
        <Card className="p-6 text-center">
          <p className="text-ink-soft">불러오는 중…</p>
        </Card>
      )}

      {isError && (
        <Card className="border-urgent/40 bg-urgent-tint p-3">
          <p className="text-sm font-medium text-[#B91C1C]">{(error as Error).message}</p>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card className="p-8 text-center">
          <p className="font-semibold text-ink">냉장고가 비었어요.</p>
          <p className="mt-1 text-sm text-ink-faint">영수증으로 재료를 채워보세요.</p>
        </Card>
      )}

      {/* 냉장고 뷰 */}
      {data && data.length > 0 && view === "fridge" && (
        <FridgeView items={data} selectedId={selected?.id} onSelect={setSelected} />
      )}

      {/* 목록 뷰 (접근성 대체) */}
      {data && data.length > 0 && view === "list" && (
        <ul className="flex flex-col gap-2">
          {data.map((item) => (
            <li key={item.id}>
              <Card className="flex items-center gap-3 p-2.5">
                <CategoryIcon category={item.category} size={24} chipSize={40} title={item.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{item.name}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <ExpiryBadge expireAt={item.expireAt} />
                    <Tag>
                      <span className="tnum">
                        {item.qty}
                        {item.unit}
                      </span>
                    </Tag>
                  </div>
                </div>
                <Button
                  variant="subtle"
                  onClick={() => setSelected(item)}
                  className="min-h-0 px-3 py-1.5 text-sm"
                >
                  관리
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* 선택 아이템 액션 시트 */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/30"
            onClick={() => setSelected(null)}
            aria-hidden="true"
          />
          <Card
            raised
            role="dialog"
            aria-label={`${selected.name} 관리`}
            className="fixed inset-x-4 bottom-[84px] z-50 mx-auto max-w-md p-4"
          >
            <div className="flex items-center gap-3">
              <CategoryIcon category={selected.category} size={30} chipSize={52} title={selected.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold text-ink">{selected.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <ExpiryBadge expireAt={selected.expireAt} />
                  <Tag>{selected.category}</Tag>
                  <Tag>
                    <span className="tnum">
                      {selected.qty}
                      {selected.unit}
                    </span>
                  </Tag>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="닫기"
                className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-muted hover:text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => consume.mutate({ id: selected.id, action: "consumed" })}
              >
                소비
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => consume.mutate({ id: selected.id, action: "discarded" })}
              >
                폐기
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => handleAdjust(selected)}>
                기한 조정
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
