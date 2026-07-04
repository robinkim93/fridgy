import type {
  HealthResponse,
  InventoryItem,
  ParsedItem,
  ReceiptJob,
  ReceiptJobStatus,
} from "@fridgy/shared";
import { supabase } from "./supabase";

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
export async function createReceipt(file: File): Promise<{
  jobId: string;
  status: ReceiptJobStatus;
}> {
  const formData = new FormData();
  formData.append("file", file);

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
  jobId?: string
): Promise<{
  inserted: number;
  itemIds: string[];
}> {
  const res = await authenticatedFetch(`${API_BASE}/inventory/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId, items }),
  });

  if (!res.ok) {
    throw new Error(
      `재고 확정 실패 (${res.status}): ${await res.text()}`
    );
  }

  return res.json();
}

/** 활성 재고 조회 (임박 순 정렬은 서버가 수행) */
export async function getInventory(): Promise<InventoryItem[]> {
  const res = await authenticatedFetch(`${API_BASE}/inventory`);
  if (!res.ok) {
    throw new Error(`재고 조회 실패 (${res.status}): ${await res.text()}`);
  }
  const data: { items: InventoryItem[] } = await res.json();
  return data.items;
}

/** 품목 소비일수 개인화 보정 → 활성 재고 즉시 반영 */
export async function setExpiryOverride(
  itemName: string,
  customDays: number
): Promise<{ itemName: string; customDays: number; updated: number }> {
  const res = await authenticatedFetch(`${API_BASE}/inventory/override`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemName, customDays }),
  });
  if (!res.ok) {
    throw new Error(`소비기한 보정 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}
