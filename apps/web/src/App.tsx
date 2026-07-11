import { useState, useEffect } from "react";
import { useAuth } from "./features/auth/useAuth";
import { LoginScreen } from "./features/auth/LoginScreen";
import { ReceiptFlow } from "./features/receipt/ReceiptFlow";
import { InventoryScreen } from "./features/inventory/InventoryScreen";
import { RecipeScreen } from "./features/recipe/RecipeScreen";
import { ReportScreen } from "./features/report/ReportScreen";
import { NotificationsScreen } from "./features/notifications/NotificationsScreen";
import { NotificationBanner } from "./features/notifications/NotificationBanner";
import { ActiveFridgeProvider } from "./features/fridge/useActiveFridge";
import { FridgeManageScreen } from "./features/fridge/FridgeManageScreen";
import { InviteAcceptScreen } from "./features/fridge/InviteAcceptScreen";
import { useConsent } from "./features/consent/useConsent";
import { ConsentOnboarding } from "./features/consent/ConsentOnboarding";
import { SettingsScreen } from "./features/consent/SettingsScreen";
import { AppShell, type TabKey } from "./ui/AppShell";

// 탭(GNB) + 전체화면 서브플로우
type Page = TabKey | "receipt" | "fridgeManage";
const TAB_KEYS: TabKey[] = ["home", "recipe", "report", "notifications", "settings"];
const isTab = (p: Page): p is TabKey => (TAB_KEYS as string[]).includes(p);

function AppInner() {
  const { session, loading: authLoading } = useAuth();
  const [page, setPage] = useState<Page>("home");
  const [inviteToken, setInviteToken] = useState<string>("");
  const [showInviteAccept, setShowInviteAccept] = useState(false);

  // 동의 상태 조회(로그인 후) — 온보딩 노출 결정.
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

  // 인증 로딩 중
  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-brand" />
        <p className="text-ink-soft">로드 중…</p>
      </main>
    );
  }

  // 초대 수락 (로그인 상태 무관 우선)
  if (showInviteAccept && inviteToken) {
    return (
      <InviteAcceptScreen
        token={inviteToken}
        onInviteAccepted={() => {
          setShowInviteAccept(false);
          setPage("home");
        }}
      />
    );
  }

  // 미로그인 → 로그인
  if (!session) return <LoginScreen />;

  // 첫 로그인 후 동의 온보딩
  if (consent && !consent.onboarded) {
    return <ConsentOnboarding onDone={() => setPage("home")} />;
  }

  // 전체화면 서브플로우 (셸/GNB 없음)
  if (page === "receipt") {
    return <ReceiptFlow onDashboardReturn={() => setPage("home")} />;
  }
  if (page === "fridgeManage") {
    return <FridgeManageScreen onDashboardReturn={() => setPage("home")} />;
  }

  // 탭 화면 (GNB 셸)
  const tab: TabKey = isTab(page) ? page : "home";
  return (
    <AppShell
      activeTab={tab}
      onTab={setPage}
      onManageFridge={() => setPage("fridgeManage")}
    >
      {tab === "home" && (
        <div className="flex flex-col gap-4">
          <NotificationBanner />
          <InventoryScreen onAddReceipt={() => setPage("receipt")} />
        </div>
      )}
      {tab === "recipe" && <RecipeScreen />}
      {tab === "report" && <ReportScreen />}
      {tab === "notifications" && <NotificationsScreen />}
      {tab === "settings" && <SettingsScreen />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ActiveFridgeProvider>
      <AppInner />
    </ActiveFridgeProvider>
  );
}
