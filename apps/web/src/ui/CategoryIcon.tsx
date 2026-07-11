import type { ItemCategory } from "@fridgy/shared";

/* Fridgy 카테고리 아이콘
 * 클린 라인 아이콘(24 그리드, currentColor) + 카테고리별 색 코딩.
 * 식품군을 한 눈에 구분 — 소비기한 신호(색+D-day)와는 별개 채널. */

/** 카테고리 → 액센트 색 (아이콘/틴트 배경 공용) */
export const CATEGORY_COLOR: Record<ItemCategory, string> = {
  유제품: "#5B8DEF", // 블루
  육류: "#C0567B", // 로즈
  수산물: "#2CA6A4", // 틸
  채소: "#4CA354", // 그린
  과일: "#E8804A", // 오렌지
  냉동식품: "#4DA6D9", // 아이스 블루
  가공식품: "#B4884D", // 탠
  통조림: "#8A8F98", // 스틸
  음료: "#7A6FE0", // 바이올렛
  기타: "#94A3B8", // 슬레이트
};

/** 각 카테고리의 라인 글리프 (stroke=currentColor, 24×24) */
const GLYPH: Record<ItemCategory, JSX.Element> = {
  유제품: (
    <>
      <path d="M7 8h10l-1.5-3.2A1 1 0 0 0 14.6 4H9.4a1 1 0 0 0-.9.8L7 8Z" />
      <path d="M6.5 8h11v11a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V8Z" />
      <path d="M10 12.5h4" />
    </>
  ),
  육류: (
    <>
      <path d="M15.5 4.5a4.5 4.5 0 0 1 0 9c-1.2 2-3.3 3-5.4 2.6-2.6-.5-4.3-3-3.8-5.6.4-2.1 2-3.7 4-4.2A4.5 4.5 0 0 1 15.5 4.5Z" />
      <path d="M6.4 15.6 4 20" />
      <path d="M8.3 16.4 6.5 21" />
    </>
  ),
  수산물: (
    <>
      <path d="M3.5 12c2.8-3.6 6.5-5 10-5 3 0 5.4 1.6 6.6 4.4.2.4.2.8 0 1.2C18.9 15.4 16.5 17 13.5 17c-3.5 0-7.2-1.4-10-5Z" />
      <path d="M20 8.5 22 7v10l-2-1.5" />
      <circle cx="8" cy="11" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  채소: (
    <>
      <path d="M12 21c-4-1-7-4-7-8.5 0 0 3 .5 5 2" />
      <path d="M12 21c0-6 2.5-11 8-13-1 6-3.5 11-8 13Z" />
    </>
  ),
  과일: (
    <>
      <path d="M12 8c-1.6-1.6-4.2-1.7-6 0-2 1.9-1.7 5.4 0 7.8C7.2 17.4 9 20 12 20s4.8-2.6 6-4.2c1.7-2.4 2-5.9 0-7.8-1.8-1.7-4.4-1.6-6 0Z" />
      <path d="M12 8V5" />
      <path d="M12 5c1-1.6 2.6-2 4-1.6-.2 1.6-1.3 2.8-2.8 3" />
    </>
  ),
  냉동식품: (
    <>
      <path d="M12 3v18" />
      <path d="M4.8 7.5 19.2 16.5" />
      <path d="M19.2 7.5 4.8 16.5" />
      <path d="M12 3 9.8 5.2M12 3l2.2 2.2M12 21l-2.2-2.2M12 21l2.2-2.2" />
      <path d="M4.8 7.5 5 10.5M4.8 7.5 7.7 7.3M19.2 16.5 19 13.5M19.2 16.5 16.3 16.7M19.2 7.5 16.3 7.3M19.2 7.5 19 10.5M4.8 16.5 7.7 16.7M4.8 16.5 5 13.5" />
    </>
  ),
  가공식품: (
    <>
      <path d="M12 3.5 20 7v10l-8 3.5L4 17V7l8-3.5Z" />
      <path d="M4 7l8 3.5L20 7" />
      <path d="M12 10.5V20.5" />
    </>
  ),
  통조림: (
    <>
      <ellipse cx="12" cy="6" rx="6" ry="2.2" />
      <path d="M6 6v12c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V6" />
      <path d="M9 10.5h6M9 13.5h6" />
    </>
  ),
  음료: (
    <>
      <path d="M8 3h8l-.6 2.4a2 2 0 0 0 .3 1.7l.9 1.3a3 3 0 0 1 .5 1.7V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7.9a3 3 0 0 1 .5-1.7l.9-1.3a2 2 0 0 0 .3-1.7L8 3Z" />
      <path d="M7 13h10" />
    </>
  ),
  기타: (
    <>
      <path d="M4 8h16l-1.4 10.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L4 8Z" />
      <path d="M8.5 8 12 3.5 15.5 8" />
      <path d="M9.5 11.5v5M14.5 11.5v5" />
    </>
  ),
};

export interface CategoryIconProps {
  category: ItemCategory;
  /** 아이콘 글리프 크기(px). 기본 24 */
  size?: number;
  /** 색 틴트 배경 칩으로 감쌀지. 기본 true */
  chip?: boolean;
  /** 칩 한 변 크기(px). 기본 size*1.7 */
  chipSize?: number;
  className?: string;
  title?: string;
}

/** 카테고리 → 클린 라인 아이콘 (색 칩 옵션) */
export function CategoryIcon({
  category,
  size = 24,
  chip = true,
  chipSize,
  className,
  title,
}: CategoryIconProps) {
  const color = CATEGORY_COLOR[category] ?? CATEGORY_COLOR["기타"];
  const glyph = GLYPH[category] ?? GLYPH["기타"];
  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color }}
      role="img"
      aria-label={title ?? category}
    >
      {title ? <title>{title}</title> : null}
      {glyph}
    </svg>
  );

  if (!chip) return <span className={className}>{svg}</span>;

  const box = chipSize ?? Math.round(size * 1.7);
  return (
    <span
      className={["inline-flex shrink-0 items-center justify-center rounded-md", className].join(" ")}
      style={{ width: box, height: box, backgroundColor: `${color}1F` }}
    >
      {svg}
    </span>
  );
}
