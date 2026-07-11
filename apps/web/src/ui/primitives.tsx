import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { expiryLevel, ddayLabel, type ExpiryLevel } from "./expiry";

/* Fridgy "Fresh Pantry" 프리미티브
 * 공통 규칙: 12px 라운드, 부드러운 그림자, 1.5px 라인, press로 살짝 눌림. */

type Variant = "primary" | "ghost" | "danger" | "subtle";

const VARIANT_CLS: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-600 active:bg-brand-600",
  ghost: "bg-surface text-ink border border-line shadow-sm hover:bg-muted",
  subtle: "bg-muted text-ink-soft hover:bg-line",
  danger: "bg-urgent text-white shadow-sm hover:brightness-95",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

/** 버튼 — 최소 높이 44px(터치), press로 눌림. */
export function Button({
  variant = "ghost",
  block,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={[
        "press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md",
        "px-4 py-2 text-base font-semibold leading-none",
        "cursor-pointer select-none transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        VARIANT_CLS[variant],
        block ? "w-full" : "",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** 강조 카드는 그림자를 크게 (액션 시트 등) */
  raised?: boolean;
}

/** 카드/패널 — 흰 표면 + 1px 라인 + 부드러운 그림자 */
export function Card({ children, raised, className = "", ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={[
        "rounded-lg border border-line bg-surface",
        raised ? "shadow-lg" : "shadow-sm",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

const LEVEL_BADGE: Record<ExpiryLevel, string> = {
  fresh: "bg-fresh-tint text-brand-600",
  soon: "bg-soon-tint text-[#B45309]",
  urgent: "bg-urgent-tint text-[#B91C1C]",
  unknown: "bg-muted text-ink-soft",
};

const LEVEL_DOT: Record<ExpiryLevel, string> = {
  fresh: "bg-fresh",
  soon: "bg-soon",
  urgent: "bg-urgent",
  unknown: "bg-ink-faint",
};

/** 소비기한 D-day 뱃지 (신호등 색 + 도트 + 텍스트 3중 신호) */
export function ExpiryBadge({ expireAt }: { expireAt: string | null }) {
  const level = expiryLevel(expireAt);
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold leading-none",
        LEVEL_BADGE[level],
      ].join(" ")}
    >
      <span
        className={[
          "h-1.5 w-1.5 rounded-full",
          LEVEL_DOT[level],
          level === "urgent" ? "pulse-urgent" : "",
        ].join(" ")}
      />
      <span className="tnum">{ddayLabel(expireAt)}</span>
    </span>
  );
}

/** 일반 라벨 pill (카테고리/수량 등) */
export function Tag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium leading-none text-ink-soft",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
