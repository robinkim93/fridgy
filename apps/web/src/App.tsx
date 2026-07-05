import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHealth } from "./lib/api";
import { useAuth } from "./features/auth/useAuth";
import { LoginScreen } from "./features/auth/LoginScreen";
import { ReceiptFlow } from "./features/receipt/ReceiptFlow";
import { InventoryScreen } from "./features/inventory/InventoryScreen";
import { RecipeScreen } from "./features/recipe/RecipeScreen";
import { ReportScreen } from "./features/report/ReportScreen";
import { NotificationsScreen } from "./features/notifications/NotificationsScreen";
import { NotificationBanner } from "./features/notifications/NotificationBanner";
import { ActiveFridgeProvider } from "./features/fridge/useActiveFridge";
import { FridgeSwitcher } from "./features/fridge/FridgeSwitcher";
import { FridgeManageScreen } from "./features/fridge/FridgeManageScreen";
import { InviteAcceptScreen } from "./features/fridge/InviteAcceptScreen";
import { useConsent } from "./features/consent/useConsent";
import { ConsentOnboarding } from "./features/consent/ConsentOnboarding";
import { SettingsScreen } from "./features/consent/SettingsScreen";

type AppPage =
  | "dashboard"
  | "receipt"
  | "inventory"
  | "recipe"
  | "report"
  | "notifications"
  | "fridgeManage"
  | "settings";

// S1: 인증 + 영수증 재고 등록 UI
function AppInner() {
  const { session, loading: authLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<AppPage>("dashboard");
  const [inviteToken, setInviteToken] = useState<string>("");
  const [showInviteAccept, setShowInviteAccept] = useState(false);

  const { data, isError, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    retry: false,
  });

  // 동의 상태 조회(로그인 후) — dataConsent를 트래커에 반영하고 온보딩 노출을 결정.
  const { data: consent } = useConsent(!!session);

  // 초대 파라미터 확인
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (token) {
      setInviteToken(token);
      setShowInviteAccept(true);
    }
  }, []);

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

  // 초대 수락 화면 (로그인 상태 관계없이 우선)
  if (showInviteAccept && inviteToken) {
    return (
      <InviteAcceptScreen
        token={inviteToken}
        onInviteAccepted={() => {
          setShowInviteAccept(false);
          setCurrentPage("dashboard");
        }}
      />
    );
  }

  // 미로그인 → 로그인 화면
  if (!session) {
    return <LoginScreen />;
  }

  // 첫 로그인 후 동의 온보딩(미완료 시). 완료되면 자동으로 통과(캐시 onboarded=true).
  if (consent && !consent.onboarded) {
    return <ConsentOnboarding onDone={() => setCurrentPage("dashboard")} />;
  }

  // 로그인됨 → 대시보드 또는 페이지 전환
  if (currentPage === "receipt") {
    return <ReceiptFlow onDashboardReturn={() => setCurrentPage("dashboard")} />;
  }

  if (currentPage === "inventory") {
    return (
      <InventoryScreen onDashboardReturn={() => setCurrentPage("dashboard")} />
    );
  }

  if (currentPage === "recipe") {
    return (
      <RecipeScreen onDashboardReturn={() => setCurrentPage("dashboard")} />
    );
  }

  if (currentPage === "report") {
    return (
      <ReportScreen onDashboardReturn={() => setCurrentPage("dashboard")} />
    );
  }

  if (currentPage === "notifications") {
    return (
      <NotificationsScreen
        onDashboardReturn={() => setCurrentPage("dashboard")}
      />
    );
  }

  if (currentPage === "fridgeManage") {
    return (
      <FridgeManageScreen onDashboardReturn={() => setCurrentPage("dashboard")} />
    );
  }

  if (currentPage === "settings") {
    return (
      <SettingsScreen onDashboardReturn={() => setCurrentPage("dashboard")} />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-8">
      <NotificationBanner />

      <FridgeSwitcher
        onManageClick={() => setCurrentPage("fridgeManage")}
      />

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

        <button
          onClick={() => setCurrentPage("recipe")}
          className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 font-medium text-gray-700 hover:border-gray-400"
        >
          🍳 레시피 추천
        </button>

        <button
          onClick={() => setCurrentPage("report")}
          className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 font-medium text-gray-700 hover:border-gray-400"
        >
          📈 절약 리포트
        </button>

        <button
          onClick={() => setCurrentPage("notifications")}
          className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 font-medium text-gray-700 hover:border-gray-400"
        >
          🔔 알림
        </button>

        <button
          onClick={() => setCurrentPage("settings")}
          className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 font-medium text-gray-700 hover:border-gray-400"
        >
          ⚙️ 설정
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

export default function App() {
  return (
    <ActiveFridgeProvider>
      <AppInner />
    </ActiveFridgeProvider>
  );
}
