import type { ReactNode } from "react";
import { NavIcon, type NavIconName } from "./NavIcon";
import { FridgeSwitcher } from "../features/fridge/FridgeSwitcher";

/* 전역 내비게이션 셸 — 상단 바 + 하단 GNB(탭).
 * 탭 화면들은 이 셸 안에 콘텐츠만 렌더한다(자체 헤더/외곽 래퍼 불필요). */

export type TabKey = "home" | "recipe" | "report" | "notifications" | "settings";

const TABS: { key: TabKey; label: string; icon: NavIconName }[] = [
  { key: "home", label: "냉장고", icon: "fridge" },
  { key: "recipe", label: "레시피", icon: "recipe" },
  { key: "report", label: "리포트", icon: "report" },
  { key: "notifications", label: "알림", icon: "bell" },
  { key: "settings", label: "설정", icon: "gear" },
];

interface AppShellProps {
  activeTab: TabKey;
  onTab: (t: TabKey) => void;
  onManageFridge: () => void;
  children: ReactNode;
}

export function AppShell({ activeTab, onTab, onManageFridge, children }: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-canvas">
      {/* 상단 바 */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight text-brand-600">
            <NavIcon name="fridge" size={20} className="text-brand" />
            Fridgy
          </span>
          <FridgeSwitcher onManageClick={onManageFridge} />
        </div>
      </header>

      {/* 콘텐츠 */}
      <main className="flex-1 px-5 pb-28 pt-4">{children}</main>

      {/* 하단 GNB */}
      <nav
        aria-label="주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-line bg-surface/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex">
          {TABS.map((t) => {
            const active = t.key === activeTab;
            return (
              <li key={t.key} className="flex-1">
                <button
                  type="button"
                  onClick={() => onTab(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "press flex min-h-[56px] w-full cursor-pointer flex-col items-center justify-center gap-1 py-1.5 transition-colors",
                    active ? "text-brand-600" : "text-ink-faint hover:text-ink-soft",
                  ].join(" ")}
                >
                  <NavIcon name={t.icon} size={23} />
                  <span className="text-[11px] font-semibold leading-none">{t.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
