import type {
  FridgeActivity,
  FridgeMember,
  FridgeRole,
  FridgeSummary,
  HealthResponse,
  InventoryItem,
  InviteAccepted,
  InviteCreated,
  InviteInfo,
  Notification,
  ParsedItem,
  ReceiptJob,
  ReceiptJobStatus,
  RecipeSuggestion,
  WasteReport,
} from "@fridgy/shared";
import { supabase } from "./supabase";

/** 활성 냉장고 스코프를 쿼리스트링으로 (미지정 시 서버가 개인 냉장고로 폴백) */
function fridgeQuery(fridgeId?: string): string {
  return fridgeId ? `?fridgeId=${encodeURIComponent(fridgeId)}` : "";
}

// Fly.io 배포 API URL. 로컬은 .env로 http://localhost:8000 사용.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

/** 인증 헤더 포함 fetch 헬퍼 */
async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("인증되지 않음. 로그인 후 다시 시도하세요.");
  }

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${session.access_token}`,
  };

  return fetch(url, { ...options, headers });
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** 영수증 파일 업로드 (multipart/form-data) → jobId 반환 */
export async function createReceipt(
  file: File,
  fridgeId?: string
): Promise<{
  jobId: string;
  status: ReceiptJobStatus;
}> {
  const formData = new FormData();
  formData.append("file", file);
  if (fridgeId) formData.append("fridgeId", fridgeId);

  const res = await authenticatedFetch(`${API_BASE}/receipts`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(
      `영수증 업로드 실패 (${res.status}): ${await res.text()}`
    );
  }

  return res.json();
}

/** 영수증 처리 상태 폴링 */
export async function getReceiptJob(jobId: string): Promise<ReceiptJob> {
  const res = await authenticatedFetch(`${API_BASE}/receipts/${jobId}`);

  if (!res.ok) {
    throw new Error(
      `영수증 조회 실패 (${res.status}): ${await res.text()}`
    );
  }

  return res.json();
}

/** 보정된 품목 최종 확정 및 재고 등록 */
export async function confirmInventory(
  items: ParsedItem[],
  jobId?: string,
  fridgeId?: string
): Promise<{
  inserted: number;
  itemIds: string[];
}> {
  const res = await authenticatedFetch(`${API_BASE}/inventory/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId, fridgeId, items }),
  });

  if (!res.ok) {
    throw new Error(
      `재고 확정 실패 (${res.status}): ${await res.text()}`
    );
  }

  return res.json();
}

/** 활성 재고 조회 (임박 순 정렬은 서버가 수행) */
export async function getInventory(fridgeId?: string): Promise<InventoryItem[]> {
  const res = await authenticatedFetch(
    `${API_BASE}/inventory${fridgeQuery(fridgeId)}`
  );
  if (!res.ok) {
    throw new Error(`재고 조회 실패 (${res.status}): ${await res.text()}`);
  }
  const data: { items: InventoryItem[] } = await res.json();
  return data.items;
}

/** 품목 소비일수 개인화 보정 → 활성 재고 즉시 반영 */
export async function setExpiryOverride(
  itemName: string,
  customDays: number,
  fridgeId?: string
): Promise<{ itemName: string; customDays: number; updated: number }> {
  const res = await authenticatedFetch(`${API_BASE}/inventory/override`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemName, customDays, fridgeId }),
  });
  if (!res.ok) {
    throw new Error(`소비기한 보정 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** 임박 재료 우선 레시피 추천 (동일 재고면 서버가 캐시 재사용) */
export async function getRecipeSuggestions(
  fridgeId?: string
): Promise<RecipeSuggestion> {
  const res = await authenticatedFetch(
    `${API_BASE}/recipes/suggest${fridgeQuery(fridgeId)}`
  );
  if (!res.ok) {
    throw new Error(`레시피 추천 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** 요리 후 사용 재료를 소비/폐기 처리 (F5) → 재고 상태 전이 */
export async function consumeItems(
  itemIds: string[],
  action: "consumed" | "discarded" = "consumed",
  fridgeId?: string
): Promise<{ updated: number }> {
  const res = await authenticatedFetch(`${API_BASE}/inventory/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds, action, fridgeId }),
  });
  if (!res.ok) {
    throw new Error(`소비 처리 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** VAPID 공개키 조회 (무인증) */
export async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API_BASE}/push/public-key`);
  if (!res.ok) {
    throw new Error(`VAPID 키 조회 실패 (${res.status}): ${await res.text()}`);
  }
  const data: { publicKey: string } = await res.json();
  return data.publicKey;
}

/** 푸시 구독 등록 */
export async function subscribePush(
  subscription: unknown
): Promise<void> {
  const res = await authenticatedFetch(`${API_BASE}/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });
  if (!res.ok) {
    throw new Error(`푸시 구독 실패 (${res.status}): ${await res.text()}`);
  }
}

/** 푸시 구독 해제 */
export async function unsubscribePush(endpoint: string): Promise<void> {
  const res = await authenticatedFetch(`${API_BASE}/push/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) {
    throw new Error(`푸시 구독 해제 실패 (${res.status}): ${await res.text()}`);
  }
}

/** 알림 목록 조회 */
export async function getNotifications(): Promise<{
  items: Notification[];
  unread: number;
}> {
  const res = await authenticatedFetch(`${API_BASE}/notifications`);
  if (!res.ok) {
    throw new Error(`알림 조회 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** 알림을 읽음으로 표시 */
export async function markNotificationRead(id: string): Promise<void> {
  const res = await authenticatedFetch(`${API_BASE}/notifications/${id}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`알림 읽음 표시 실패 (${res.status}): ${await res.text()}`);
  }
}

// ── 공유 냉장고 (S5, F6) ────────────────────────────────────────────────────

/** 내가 속한 냉장고 목록 (스위처용). 개인 냉장고가 없으면 서버가 생성한다. */
export async function getFridges(): Promise<FridgeSummary[]> {
  const res = await authenticatedFetch(`${API_BASE}/fridges`);
  if (!res.ok) {
    throw new Error(`냉장고 목록 조회 실패 (${res.status}): ${await res.text()}`);
  }
  const data: { items: FridgeSummary[] } = await res.json();
  return data.items;
}

/** 냉장고 이름 변경 (소유자 전용) */
export async function renameFridge(
  fridgeId: string,
  name: string
): Promise<FridgeSummary> {
  const res = await authenticatedFetch(`${API_BASE}/fridges/${fridgeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`이름 변경 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** 만료형 초대 링크 생성 (소유자 전용) */
export async function createInvite(
  fridgeId: string,
  role: FridgeRole = "member",
  ttlHours = 72
): Promise<InviteCreated> {
  const res = await authenticatedFetch(
    `${API_BASE}/fridges/${fridgeId}/invite`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, ttlHours }),
    }
  );
  if (!res.ok) {
    throw new Error(`초대 생성 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** 초대 미리보기 (무인증 — 수락 화면에서 냉장고 이름·만료 여부 표시) */
export async function getInviteInfo(token: string): Promise<InviteInfo> {
  const res = await fetch(`${API_BASE}/fridges/invites/${token}`);
  if (!res.ok) {
    throw new Error(`초대 조회 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** 초대 수락 → 멤버 편입 */
export async function acceptInvite(token: string): Promise<InviteAccepted> {
  const res = await authenticatedFetch(
    `${API_BASE}/fridges/invites/${token}/accept`,
    { method: "POST", headers: { "Content-Type": "application/json" } }
  );
  if (!res.ok) {
    throw new Error(`초대 수락 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** 냉장고 멤버 목록 */
export async function getMembers(fridgeId: string): Promise<FridgeMember[]> {
  const res = await authenticatedFetch(
    `${API_BASE}/fridges/${fridgeId}/members`
  );
  if (!res.ok) {
    throw new Error(`멤버 조회 실패 (${res.status}): ${await res.text()}`);
  }
  const data: { items: FridgeMember[] } = await res.json();
  return data.items;
}

/** 멤버 제거 (소유자 전용) */
export async function removeMember(
  fridgeId: string,
  targetUserId: string
): Promise<void> {
  const res = await authenticatedFetch(
    `${API_BASE}/fridges/${fridgeId}/members/${targetUserId}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    throw new Error(`멤버 제거 실패 (${res.status}): ${await res.text()}`);
  }
}

/** 변경 로그 (추가/소비/폐기/참여) */
export async function getActivity(fridgeId: string): Promise<FridgeActivity[]> {
  const res = await authenticatedFetch(
    `${API_BASE}/fridges/${fridgeId}/activity`
  );
  if (!res.ok) {
    throw new Error(`변경 로그 조회 실패 (${res.status}): ${await res.text()}`);
  }
  const data: { items: FridgeActivity[] } = await res.json();
  return data.items;
}

// ── S6 절약/낭비 리포트 (F7) ───────────────────────────────────────────────

/** 절약/낭비 리포트 조회 (월별 소비/폐기 통계) */
export async function getWasteReport(
  fridgeId?: string,
  months = 6
): Promise<WasteReport> {
  const q = fridgeId
    ? `?fridgeId=${encodeURIComponent(fridgeId)}&months=${months}`
    : `?months=${months}`;
  const res = await authenticatedFetch(`${API_BASE}/reports/waste${q}`);
  if (!res.ok)
    throw new Error(`리포트 조회 실패 (${res.status}): ${await res.text()}`);
  return res.json();
}
