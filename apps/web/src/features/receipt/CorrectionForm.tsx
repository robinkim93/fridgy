import { useState } from "react";
import type { ItemCategory, ParsedItem } from "@fridgy/shared";
import { confirmInventory } from "../../lib/api";

interface CorrectionFormProps {
  initialItems: ParsedItem[];
  jobId?: string;
  onSuccess: (itemIds: string[]) => void;
  onError: (message: string) => void;
  fridgeId?: string;
}

const CATEGORIES: ItemCategory[] = [
  "유제품",
  "육류",
  "수산물",
  "채소",
  "과일",
  "냉동식품",
  "가공식품",
  "통조림",
  "음료",
  "기타",
];

export function CorrectionForm({
  initialItems,
  jobId,
  onSuccess,
  onError,
  fridgeId,
}: CorrectionFormProps) {
  const [items, setItems] = useState<ParsedItem[]>(initialItems);
  const [confirming, setConfirming] = useState(false);

  /** 특정 행의 필드 업데이트 */
  const updateItem = (index: number, field: keyof ParsedItem, value: any) => {
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      [field]: value,
    };
    setItems(newItems);
  };

  /** 행 삭제 */
  const deleteItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  /** 빈 행 추가 */
  const addItem = () => {
    setItems([
      ...items,
      {
        rawText: "",
        name: "",
        qty: 1,
        unit: "개",
        category: "기타",
      },
    ]);
  };

  /** 최종 확정 */
  const handleConfirm = async () => {
    // 유효성 확인: name, qty 필수
    const valid = items.every((item) => item.name.trim() && item.qty > 0);
    if (!valid) {
      onError("모든 항목의 이름과 수량을 확인하세요.");
      return;
    }

    setConfirming(true);
    try {
      const { itemIds } = await confirmInventory(items, jobId, fridgeId);
      onSuccess(itemIds);
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "재고 확정 중 오류가 발생했습니다."
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          영수증 보정 및 확인
        </h2>
        <p className="text-sm text-gray-500">
          인식된 품목을 검토하고 수정한 후 확정하세요.
        </p>
      </div>

      {/* 보정 가능한 리스트 */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3"
          >
            {/* rawText - 읽기전용 */}
            {item.rawText && (
              <div className="text-xs text-gray-500">
                원문: <span className="font-mono">{item.rawText}</span>
              </div>
            )}

            {/* 편집 가능한 필드들 */}
            <div className="grid grid-cols-2 gap-2">
              {/* 품목명 */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600">
                  품목명 *
                </label>
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateItem(index, "name", e.target.value)}
                  placeholder="예: 우유"
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 수량 */}
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  수량 *
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={item.qty}
                  onChange={(e) => updateItem(index, "qty", parseFloat(e.target.value) || 1)}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 단위 */}
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  단위
                </label>
                <input
                  type="text"
                  value={item.unit}
                  onChange={(e) => updateItem(index, "unit", e.target.value)}
                  placeholder="개, g, ml 등"
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 카테고리 */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600">
                  카테고리
                </label>
                <select
                  value={item.category}
                  onChange={(e) =>
                    updateItem(index, "category", e.target.value as ItemCategory)
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 삭제 버튼 */}
            <button
              onClick={() => deleteItem(index)}
              className="text-xs text-red-600 hover:text-red-700 hover:underline"
            >
              삭제
            </button>
          </div>
        ))}
      </div>

      {/* 행 추가 버튼 */}
      <button
        onClick={addItem}
        className="w-full rounded-lg border-2 border-gray-300 px-4 py-2 font-medium text-gray-700 hover:border-gray-400"
      >
        + 품목 추가
      </button>

      {/* 확정 버튼 */}
      <button
        onClick={handleConfirm}
        disabled={confirming || items.length === 0}
        className="w-full rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {confirming ? "확정 중…" : "✓ 확정 및 재고 등록"}
      </button>
    </div>
  );
}
