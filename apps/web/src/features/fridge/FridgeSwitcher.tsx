import { useActiveFridge } from "./useActiveFridge";

interface FridgeSwitcherProps {
  onManageClick: () => void;
}

export function FridgeSwitcher({ onManageClick }: FridgeSwitcherProps) {
  const { fridges, activeFridge, setActiveFridgeId } = useActiveFridge();

  if (!activeFridge) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {fridges.length > 1 ? (
            <select
              value={activeFridge.id}
              onChange={(e) => setActiveFridgeId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:border-gray-400"
            >
              {fridges.map((fridge) => (
                <option key={fridge.id} value={fridge.id}>
                  {fridge.name}
                  {fridge.isOwner ? " (소유자)" : " (멤버)"}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-sm font-medium text-gray-800">
                {activeFridge.name}
              </p>
              <p className="text-xs text-gray-500">
                {activeFridge.isOwner ? "소유자" : "멤버"}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={onManageClick}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ⚙️ 관리
        </button>
      </div>
    </div>
  );
}
