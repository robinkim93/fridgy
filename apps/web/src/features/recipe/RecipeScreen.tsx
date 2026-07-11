import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Recipe } from "@fridgy/shared";
import { track } from "../../lib/track";
import {
  consumeItems,
  getInventory,
  getRecipeSuggestions,
  shareRecipe,
} from "../../lib/api";
import { useActiveFridge } from "../fridge/useActiveFridge";

// GNB 셸의 탭 콘텐츠 — 자체 헤더/네비 없음.

function RecipeCard({
  recipe,
  onCook,
  onShare,
  sharing,
}: {
  recipe: Recipe;
  onCook: () => void;
  onShare: () => void;
  sharing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // 임박 재료는 주황으로만 강조(사용 재료와 중복 칩 방지). used에 없는 임박도 뒤에 붙인다.
  const expiring = new Set(recipe.expiringUsed);
  const chips = [
    ...recipe.usedIngredients,
    ...recipe.expiringUsed.filter((ing) => !recipe.usedIngredients.includes(ing)),
  ];

  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-ink">{recipe.title}</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {chips.map((ing) =>
                expiring.has(ing) ? (
                  // 임박 재료: 강조 칩(앰버)
                  <span
                    key={ing}
                    className="inline-block rounded-full bg-soon-tint px-2 py-1 text-xs font-semibold text-[#B45309]"
                  >
                    {ing}
                  </span>
                ) : (
                  // 일반 사용 재료
                  <span
                    key={ing}
                    className="inline-block rounded-full bg-muted px-2 py-1 text-xs text-ink-soft"
                  >
                    {ing}
                  </span>
                )
              )}
            </div>
          </div>
          <svg
            className={`shrink-0 text-ink-faint transition-transform ${expanded ? "rotate-90" : ""}`}
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>
      </button>

      {/* 부족 재료 표시 */}
      {recipe.missing.length > 0 && (
        <p className="mt-2 text-xs text-ink-faint">필요: {recipe.missing.join(", ")}</p>
      )}

      {/* 상세 펼침 */}
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <h4 className="text-sm font-semibold text-ink-soft">조리 단계</h4>
            <ol className="tnum mt-2 space-y-1">
              {recipe.steps.map((step, idx) => (
                <li key={idx} className="text-xs text-ink-soft">
                  {idx + 1}. {step}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCook}
              className="press flex-1 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              이 요리 만들었어요
            </button>
            <button
              onClick={onShare}
              disabled={sharing}
              className="press inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-muted disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
              {sharing ? "공유 중…" : "공유"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecipeScreen() {
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

  // 추천 결과가 도착하면 1회 기록(캐시 여부·건수 신호).
  useEffect(() => {
    if (suggestions) {
      track("recipe_suggested", {
        count: suggestions.items.length,
        cached: suggestions.cached,
      });
    }
  }, [suggestions]);

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
      track("recipe_cooked", { items: result.updated });
      // 무효화하여 재고와 레시피 모두 갱신
      queryClient.invalidateQueries({ queryKey: ["inventory", activeFridgeId] });
      queryClient.invalidateQueries({ queryKey: ["recipes", activeFridgeId] });
      setSuccessMessage(`소비 처리됨 ${result.updated}건`);
      setTimeout(() => setSuccessMessage(""), 3000);
    },
  });

  // 공유: 공개 페이지 생성 → Web Share API(모바일) 또는 링크 복사(데스크톱)
  const shareMutation = useMutation({
    mutationFn: (recipe: Recipe) => shareRecipe(recipe, activeFridgeId),
    onSuccess: async ({ url }, recipe) => {
      track("recipe_shared", {});
      setSuccessMessage("");
      try {
        if (navigator.share) {
          await navigator.share({ title: recipe.title, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        setSuccessMessage("공유 링크를 복사했어요");
        setTimeout(() => setSuccessMessage(""), 3000);
      } catch {
        // 사용자가 공유 시트를 닫은 경우 등 — 조용히 무시
      }
    },
    onError: (err) => {
      window.alert((err as Error).message);
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
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">레시피 추천</h1>

      {/* 임박 재료 안내 */}
      {suggestions && suggestions.expiringNames.length > 0 && (
        <div className="rounded-lg border border-soon/30 bg-soon-tint p-3 text-sm text-[#B45309]">
          임박 재료 소진 우선: <span className="font-semibold">{suggestions.expiringNames.join(", ")}</span>
        </div>
      )}

      {/* 성공 메시지 */}
      {successMessage && (
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm font-medium text-brand-600">
          {successMessage}
        </div>
      )}

      {/* 로딩 중 */}
      {(suggestionsLoading || inventoryLoading) && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-brand" />
        </div>
      )}

      {/* 에러 표시 */}
      {suggestionsError && (
        <div className="rounded-lg border border-urgent/30 bg-urgent-tint p-3 text-sm text-[#B91C1C]">
          {(suggestionsErrorObj as Error).message}
        </div>
      )}

      {/* 빈 상태 */}
      {suggestions && suggestions.items.length === 0 && (
        <div className="rounded-lg border border-line bg-muted p-8 text-center text-ink-faint">
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
                onShare={() => shareMutation.mutate(recipe)}
                sharing={
                  shareMutation.isPending &&
                  shareMutation.variables?.title === recipe.title
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
