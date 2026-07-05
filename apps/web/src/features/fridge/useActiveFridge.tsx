import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FridgeSummary } from "@fridgy/shared";
import { getFridges } from "../../lib/api";

interface ActiveFridgeContextType {
  fridges: FridgeSummary[];
  activeFridgeId: string | undefined;
  activeFridge: FridgeSummary | undefined;
  setActiveFridgeId: (id: string) => void;
  isLoading: boolean;
  refetch: () => void;
}

const ActiveFridgeContext = createContext<ActiveFridgeContextType | undefined>(
  undefined
);

const ACTIVE_FRIDGE_KEY = "fridgy.activeFridgeId";

export function ActiveFridgeProvider({ children }: { children: ReactNode }) {
  const { data: fridges = [], isLoading, refetch } = useQuery({
    queryKey: ["fridges"],
    queryFn: getFridges,
    retry: false,
  });

  const [activeFridgeId, setActiveFridgeIdState] = useState<
    string | undefined
  >(undefined);

  // 초기화: localStorage에서 저장된 id 로드
  useEffect(() => {
    const saved = localStorage.getItem(ACTIVE_FRIDGE_KEY);
    setActiveFridgeIdState(saved ?? undefined);
  }, []);

  // fridges 로드 후, activeFridgeId 검증
  useEffect(() => {
    if (!isLoading && fridges.length > 0) {
      const current = activeFridgeId ?? localStorage.getItem(ACTIVE_FRIDGE_KEY);
      const exists = fridges.some((f) => f.id === current);
      if (!exists) {
        // 저장된 id가 목록에 없으면 첫 번째(개인 냉장고)로 폴백
        const firstId = fridges[0].id;
        setActiveFridgeIdState(firstId);
        localStorage.setItem(ACTIVE_FRIDGE_KEY, firstId);
      } else if (current && !activeFridgeId) {
        setActiveFridgeIdState(current);
      }
    }
  }, [fridges, isLoading, activeFridgeId]);

  const setActiveFridgeId = (id: string) => {
    setActiveFridgeIdState(id);
    localStorage.setItem(ACTIVE_FRIDGE_KEY, id);
  };

  const activeFridge = fridges.find((f) => f.id === activeFridgeId);

  return (
    <ActiveFridgeContext.Provider
      value={{
        fridges,
        activeFridgeId,
        activeFridge,
        setActiveFridgeId,
        isLoading,
        refetch,
      }}
    >
      {children}
    </ActiveFridgeContext.Provider>
  );
}

export function useActiveFridge() {
  const context = useContext(ActiveFridgeContext);
  if (!context) {
    throw new Error("useActiveFridge must be used within ActiveFridgeProvider");
  }
  return context;
}
