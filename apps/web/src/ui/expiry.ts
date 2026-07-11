/* 소비기한 신호등 로직 — 재고/냉장고 뷰가 공유. */

export type ExpiryLevel = "fresh" | "soon" | "urgent" | "unknown";

/** expireAt(ISO date) → 오늘 기준 남은 일수. null이면 null. */
export function daysLeft(expireAt: string | null): number | null {
  if (!expireAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expireAt + "T00:00:00");
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

/** 남은 일수 → 신호등 레벨. 여유(6+) / 임박(1~5) / 긴급(D-day·지남) */
export function expiryLevel(expireAt: string | null): ExpiryLevel {
  const d = daysLeft(expireAt);
  if (d === null) return "unknown";
  if (d <= 0) return "urgent";
  if (d <= 5) return "soon";
  return "fresh";
}

/** D-day 라벨 텍스트 */
export function ddayLabel(expireAt: string | null): string {
  const d = daysLeft(expireAt);
  if (d === null) return "미정";
  if (d < 0) return `${-d}일 지남`;
  if (d === 0) return "D-DAY";
  return `D-${d}`;
}

/** 레벨 → 신호등 색 HEX (상태 dot 등 인라인용) */
export const LEVEL_COLOR: Record<ExpiryLevel, string> = {
  fresh: "#059669",
  soon: "#f59e0b",
  urgent: "#ef4444",
  unknown: "#94a3b8",
};
