// Fridgy 공용 도메인 타입 (web ↔ api 계약)
// 스키마 스케치는 03_개발계획.md S1·S2 참조. 구현 진행에 따라 확장한다.

/** 재고 품목 상태 전이 (F5) */
export type InventoryStatus = "active" | "consumed" | "discarded";

/** 영수증 처리 작업 상태 (F1 비동기 파이프라인) */
export type ReceiptJobStatus = "processing" | "done" | "failed";

/** 품목 카테고리 (소비기한 매핑 기준) */
export type ItemCategory =
  | "유제품"
  | "육류"
  | "수산물"
  | "채소"
  | "과일"
  | "냉동식품"
  | "가공식품"
  | "통조림"
  | "음료"
  | "기타";

/** 정규화된 재고 품목 (inventory_items) */
export interface InventoryItem {
  id: string;
  fridgeId: string; // S5 대비: 개인 냉장고 = 멤버 1명인 fridge
  name: string;
  category: ItemCategory;
  qty: number;
  unit: string;
  purchasedAt: string; // ISO 8601
  expireAt: string | null; // purchasedAt + 소비기한(일)
  source: "receipt" | "manual" | "voice";
  status: InventoryStatus;
}

/** OCR→정규화 결과의 단일 후보 품목 (보정 UI 입력) */
export interface ParsedItem {
  rawText: string; // OCR 원문 (예: "서울우유1L")
  name: string; // 정규화 결과 (예: "우유")
  qty: number;
  unit: string;
  category: ItemCategory;
}

/** GET /receipts/{id} 폴링 응답 */
export interface ReceiptJob {
  id: string;
  status: ReceiptJobStatus;
  items: ParsedItem[];
  error?: string | null;
}

/** GET /health 응답 */
export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
}

/** 추천 레시피 (F4) — 임박 재료 우선 소진 */
export interface Recipe {
  title: string;
  usedIngredients: string[]; // 이 요리가 쓰는 보유 재료
  expiringUsed: string[]; // 소진하는 임박 재료 (상위 정렬 기준)
  missing: string[]; // 부족한 재료
  steps: string[]; // 조리 단계
}

/** GET /recipes/suggest 응답 */
export interface RecipeSuggestion {
  items: Recipe[];
  expiringNames: string[]; // 정렬 기준이 된 임박 재료
  cached: boolean; // 캐시 재사용 여부
}

/** 공유 냉장고 멤버십 역할 (F6) */
export type FridgeRole = "owner" | "member";

/** 사용자가 속한 냉장고 요약 (스위처용) */
export interface FridgeSummary {
  id: string;
  name: string;
  role: FridgeRole;
  isOwner: boolean;
}

/** POST /fridges/{id}/invite 응답 — 만료형 초대 토큰 */
export interface InviteCreated {
  token: string;
  role: FridgeRole;
  expiresAt: string; // ISO 8601
}

/** GET /fridges/invites/{token} — 수락 화면용 미리보기(무인증) */
export interface InviteInfo {
  fridgeName: string;
  role: FridgeRole;
  expired: boolean;
  accepted: boolean;
}

/** POST /fridges/invites/{token}/accept 응답 */
export interface InviteAccepted {
  fridgeId: string;
  name: string;
  alreadyMember: boolean;
}

/** 공유 냉장고 멤버 (F6) */
export interface FridgeMember {
  userId: string;
  role: FridgeRole;
  joinedAt: string; // ISO 8601
}

/** 변경 로그 항목 (F6 협업 신뢰용) */
export interface FridgeActivity {
  id: string;
  actorUserId: string;
  action: string; // added | consumed | discarded | member_joined | member_removed
  detail: Record<string, unknown>;
  createdAt: string; // ISO 8601
}

/** 임박 알림 (F3) */
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  itemIds: string[];
  readAt: string | null; // ISO 8601, null이면 미읽음
  createdAt: string; // ISO 8601
}
