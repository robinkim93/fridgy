import { useActiveFridge } from "./useActiveFridge";
import { Button } from "../../ui/primitives";

interface FridgeSwitcherProps {
  onManageClick: () => void;
}

/** GNB 상단 바용 컴팩트 냉장고 선택기. */
export function FridgeSwitcher({ onManageClick }: FridgeSwitcherProps) {
  const { fridges, activeFridge, setActiveFridgeId } = useActiveFridge();

  if (!activeFridge) return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {fridges.length > 1 ? (
        <select
          value={activeFridge.id}
          onChange={(e) => setActiveFridgeId(e.target.value)}
          className="max-w-[9rem] rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink shadow-sm"
        >
          {fridges.map((fridge) => (
            <option key={fridge.id} value={fridge.id}>
              {fridge.name}
              {fridge.isOwner ? " (소유자)" : " (멤버)"}
            </option>
          ))}
        </select>
      ) : (
        <span className="max-w-[8rem] truncate rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink shadow-sm">
          {activeFridge.name}
        </span>
      )}
      <Button variant="subtle" onClick={onManageClick} className="min-h-0 px-3 py-1.5 text-sm">
        관리
      </Button>
    </div>
  );
}
