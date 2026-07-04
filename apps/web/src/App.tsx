import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHealth } from "./lib/api";
import { useAuth } from "./features/auth/useAuth";
import { LoginScreen } from "./features/auth/LoginScreen";
import { ReceiptFlow } from "./features/receipt/ReceiptFlow";
import { InventoryScreen } from "./features/inventory/InventoryScreen";

type AppPage = "dashboard" | "receipt" | "inventory";

// S1: 인증 + 영수증 재고 등록 UI
export default function App() {
  const { session, loading: authLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<AppPage>("dashboard");

  const { data, isError, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    retry: false,
  });

  const apiStatus = isLoading
    ? "확인 중…"
    : isError
      ? "연결 안 됨"
      : `연결됨 (${data?.version})`;

  // 인증 로딩 중
  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        <p className="text-gray-500">로드 중…</p>
      </main>
    );
  }

  // 미로그인 → 로그인 화면
  if (!session) {
    return <LoginScreen />;
  }

  // 로그인됨 → 대시보드 또는 영수증 흐름
  if (currentPage === "receipt") {
    return <ReceiptFlow onDashboardReturn={() => setCurrentPage("dashboard")} />;
  }

  if (currentPage === "inventory") {
    return (
      <InventoryScreen onDashboardReturn={() => setCurrentPage("dashboard")} />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <div className="text-5xl mb-2">🧊</div>
        <h1 className="text-2xl font-bold text-green-700">Fridgy</h1>
        <p className="text-gray-500">냉장고 식재료 유통기한 관리</p>
      </div>

      <div className="w-full space-y-3">
        <button
          onClick={() => setCurrentPage("receipt")}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
        >
          📷 영수증으로 재고 추가
        </button>

        <button
          onClick={() => setCurrentPage("inventory")}
          className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 font-medium text-gray-700 hover:border-gray-400"
        >
          📊 나의 재고 확인
        </button>
      </div>

      <div className="rounded-lg border px-4 py-2 text-sm text-gray-600">
        API: <span className="font-medium">{apiStatus}</span>
      </div>

      <button
        onClick={async () => {
          const { error } = await import("./lib/supabase").then(({ supabase }) =>
            supabase.auth.signOut()
          );
          if (error) alert(`로그아웃 실패: ${error.message}`);
        }}
        className="mt-4 text-sm text-gray-500 hover:text-gray-700"
      >
        로그아웃
      </button>
    </main>
  );
}
