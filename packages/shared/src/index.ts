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
