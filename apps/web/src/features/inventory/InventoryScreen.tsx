import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InventoryItem } from "@fridgy/shared";
import { consumeItems, getInventory, setExpiryOverride } from "../../lib/api";
import { track } from "../../lib/track";
import { useActiveFridge } from "../fridge/useActiveFridge";

interface InventoryScreenProps {
  onDashboardReturn: () => void;
}

/** expireAt(ISO date) → 오늘 기준 남은 일수. null이면 null. */
function daysLeft(expireAt: string | null): number | null {
  if (!expireAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expireAt + "T00:00:00");
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

function DdayBadge({ expireAt }: { expireAt: string | null }) {
  const d = daysLeft(expireAt);
  if (d === null) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        미정
      </span>
    );
  }
  const { label, cls } =
    d < 0
      ? { label: `${-d}일 지남`, cls: "bg-red-100 text-red-700" }
      : d === 0
        ? { label: "D-day", cls: "bg-red-100 text-red-700" }
        : d <= 2
          ? { label: `D-${d}`, cls: "bg-orange-100 text-orange-700" }
          : d <= 5
            ? { label: `D-${d}`, cls: "bg-yellow-100 text-yellow-700" }
            : { label: `D-${d}`, cls: "bg-green-100 text-green-700" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function InventoryScreen({ onDashboardReturn }: InventoryScreenProps) {
  const queryClient = useQueryClient();
  const { activeFridgeId } = useActiveFridge();
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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-green-700">나의 재고</h1>
        <button
          onClick={onDashboardReturn}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 대시보드
        </button>
      </div>
      <p className="text-sm text-gray-500">임박한 순서로 정렬됩니다.</p>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500">
          아직 재고가 없어요. 영수증으로 추가해보세요.
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-800">
                  {item.name}
                  <span className="ml-2 text-xs text-gray-400">
                    {item.qty}
                    {item.unit} · {item.category}
                  </span>
                </p>
                <p className="text-xs text-gray-400">
                  {item.expireAt ? `~ ${item.expireAt}` : "소비기한 미정"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DdayBadge expireAt={item.expireAt} />
                <button
                  onClick={() => handleAdjust(item)}
                  disabled={override.isPending}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-gray-400 disabled:opacity-50"
                >
                  조정
                </button>
                <button
                  onClick={() => consume.mutate({ id: item.id, action: "consumed" })}
                  disabled={consume.isPending}
                  className="rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700 hover:border-green-300 disabled:opacity-50"
                >
                  소비
                </button>
                <button
                  onClick={() => consume.mutate({ id: item.id, action: "discarded" })}
                  disabled={consume.isPending}
                  className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:border-red-300 disabled:opacity-50"
                >
                  폐기
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
