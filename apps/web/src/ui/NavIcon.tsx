/* GNB용 클린 라인 아이콘. currentColor stroke로 활성/비활성 색 상속. */

export type NavIconName = "fridge" | "recipe" | "report" | "bell" | "gear";

const GLYPH: Record<NavIconName, JSX.Element> = {
  fridge: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2.5" />
      <path d="M6 10.5h12" />
      <path d="M9 6.5v1.5" />
      <path d="M9 13v2" />
    </>
  ),
  recipe: (
    <>
      <path d="M7 8a5 5 0 0 1 10 0c0 1.9-1 3-2 3.7V15H9v-3.3C8 11 7 9.9 7 8Z" />
      <path d="M9 18h6" />
      <path d="M9.5 21h5" />
    </>
  ),
  report: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2.2a.5.5 0 0 1-.4.8H4.9a.5.5 0 0 1-.4-.8L6 16Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.2 7l2.2 1.3M17.6 15.7l2.2 1.3M4.2 17l2.2-1.3M17.6 8.3l2.2-1.3" />
    </>
  ),
};

export function NavIcon({
  name,
  size = 22,
  className,
}: {
  name: NavIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPH[name]}
    </svg>
  );
}
