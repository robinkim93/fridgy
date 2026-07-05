// SD-1 경량 이벤트 트래커.
// - 익명 session_id(localStorage) + type + props만 큐잉해 배치 전송한다.
// - 동의(SD-2) 게이팅: dataConsent가 true일 때만 전송한다. 기본은 비수집(프라이버시 우선).
// - 배치: 짧은 디바운스로 모아 보내고, 페이지 이탈(pagehide) 시 즉시 플러시한다.

import type { AnalyticsEvent, EventType } from "@fridgy/shared";
import { sendEvents } from "./api";

const SESSION_KEY = "fg_session";
const FLUSH_DELAY_MS = 4000;

let consented = false;
let queue: AnalyticsEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function sessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  // 실패는 조용히 버린다(분석 유실은 기능을 막지 않는다).
  void sendEvents(sessionId(), batch).catch(() => {});
}

/** 동의 상태 반영. 미동의 전환 시 대기 큐를 폐기한다. */
export function setTrackingConsent(value: boolean): void {
  consented = value;
  if (!value) queue = [];
}

/** 표준 이벤트 기록(동의 시에만 큐잉). */
export function track(type: EventType, props?: Record<string, unknown>): void {
  if (!consented) return;
  queue.push(props ? { type, props } : { type });
  if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS);
}

// 이탈 시 유실 최소화.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
