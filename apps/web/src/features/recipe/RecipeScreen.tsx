import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Recipe } from "@fridgy/shared";
import {
  consumeItems,
  getInventory,
  getRecipeSuggestions,
} from "../../lib/api";
import { useActiveFridge } from "../fridge/useActiveFridge";

interface RecipeScreenProps {
  onDashboardReturn: () => void;
}

function RecipeCard({ recipe, onCook }: { recipe: Recipe; onCook: () => void }) {
  const [expanded, setExpanded] = useState(false);

  // 임박 재료는 주황으로만 강조(사용 재료와 중복 칩 방지). used에 없는 임박도 뒤에 붙인다.
  const expiring = new Set(recipe.expiringUsed);
  const chips = [
    ...recipe.usedIngredients,
    ...recipe.expiringUsed.filter((ing) => !recipe.usedIngredients.includes(ing)),
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-gray-800">{recipe.title}</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {chips.map((ing) =>
                expiring.has(ing) ? (
                  // 임박 재료: 강조 칩(주황)
                  <span
                    key={ing}
                    className="inline-block rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700"
                  >
                    {ing}
                  </span>
                ) : (
                  // 일반 사용 재료: 파랑 칩
                  <span
                    key={ing}
                    className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700"
                  >
                    {ing}
                  </span>
                )
              )}
            </div>
          </div>
          <span className="shrink-0 text-gray-400">
            {expanded ? "▼" : "▶"}
          </span>
        </div>
      </button>

      {/* 부족 재료 표시 */}
      {recipe.missing.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          필요: {recipe.missing.join(", ")}
        </p>
      )}

      {/* 상세 펼침 */}
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700">조리 단계</h4>
            <ol className="mt-2 space-y-1">
              {recipe.steps.map((step, idx) => (
                <li key={idx} className="text-xs text-gray-600">
                  {idx + 1}. {step}
                </li>
              ))}
            </ol>
          </div>
          <button
            onClick={onCook}
            className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            이 요리 만들었어요
          </button>
        </div>
      )}
    </div>
  );
}

export function RecipeScreen({ onDashboardReturn }: RecipeScreenProps) {
  const queryClient = useQueryClient();
  const { activeFridgeId } = useActiveFridge();
  const [successMessage, setSuccessMessage] = useState<string>("");

  // 레시피 추천 조회
  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    isError: suggestionsError,
    error: suggestionsErrorObj,
  } = useQuery({
    queryKey: ["recipes", activeFridgeId],
    queryFn: () => getRecipeSuggestions(activeFridgeId),
    retry: false,
  });

  // 현재 재고 조회 (요리 후 재료 매칭용)
  const {
    data: inventory,
    isLoading: inventoryLoading,
  } = useQuery({
    queryKey: ["inventory", activeFridgeId],
    queryFn: () => getInventory(activeFridgeId),
    retry: false,
  });

  // 소비 처리 mutation
  const consumeMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      consumeItems(itemIds, "consumed", activeFridgeId),
    onSuccess: (result) => {
      // 무효화하여 재고와 레시피 모두 갱신
      queryClient.invalidateQueries({ queryKey: ["inventory", activeFridgeId] });
      queryClient.invalidateQueries({ queryKey: ["recipes", activeFridgeId] });
      setSuccessMessage(`소비 처리됨 ${result.updated}건`);
      setTimeout(() => setSuccessMessage(""), 3000);
    },
  });

  const handleCookRecipe = (recipe: Recipe) => {
    setSuccessMessage("");

    // 현재 재고와 레시피 재료를 매칭
    if (!inventory || inventory.length === 0) {
      window.alert("재고에서 일치하는 재료가 없어요.");
      return;
    }

    // 정확 일치(===)로 매칭해 itemIds 수집
    const itemIds: string[] = [];
    for (const usedName of recipe.usedIngredients) {
      const matched = inventory.find((item) => item.name === usedName);
      if (matched) {
        itemIds.push(matched.id);
      }
    }

    if (itemIds.length === 0) {
      window.alert("재고에서 일치하는 재료가 없어요.");
      return;
    }

    consumeMutation.mutate(itemIds);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-green-700">레시피 추천</h1>
        <button
          onClick={onDashboardReturn}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 대시보드
        </button>
      </div>

      {/* 임박 재료 안내 */}
      {suggestions && suggestions.expiringNames.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
          임박 재료 소진 우선: <span className="font-medium">{suggestions.expiringNames.join(", ")}</span>
        </div>
      )}

      {/* 성공 메시지 */}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      {/* 로딩 중 */}
      {(suggestionsLoading || inventoryLoading) && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
        </div>
      )}

      {/* 에러 표시 */}
      {suggestionsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(suggestionsErrorObj as Error).message}
        </div>
      )}

      {/* 빈 상태 */}
      {suggestions && suggestions.items.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500">
          추천할 재료가 부족해요. 재고를 더 추가해보세요.
        </div>
      )}

      {/* 레시피 목록 */}
      {suggestions && suggestions.items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {suggestions.items.map((recipe, idx) => (
            <li key={idx}>
              <RecipeCard
                recipe={recipe}
                onCook={() => handleCookRecipe(recipe)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
