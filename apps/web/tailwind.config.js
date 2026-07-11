/** @type {import('tailwindcss').Config} */
// Fridgy "Fresh Pantry" 디자인 토큰 — 값의 원천은 src/index.css(:root)와 일치.
// 클린 플랫 디자인: 따뜻한 그로서리 그린 + 식품 앰버, 부드러운 그림자·라운드.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 표면
        canvas: "#F6F9F8", // 앱 배경(아주 옅은 쿨-뉴트럴)
        surface: "#FFFFFF", // 카드/시트
        muted: "#F1F5F4", // 보조 표면
        line: { DEFAULT: "#E5EBEA", strong: "#D3DBDA" }, // 테두리·구분선

        // 잉크(텍스트) — 슬레이트 계열
        ink: { DEFAULT: "#0F172A", soft: "#475569", faint: "#94A3B8" },

        // 브랜드 — 신선한 그로서리 그린
        brand: {
          DEFAULT: "#059669",
          600: "#047857",
          700: "#065F46",
          100: "#D1FAE5",
          50: "#ECFDF5",
        },
        // 액센트 — 식품 앰버
        accent: { DEFAULT: "#D97706", 100: "#FEF3C7", 50: "#FFFBEB" },

        // 소비기한 신호등 (제품 핵심 시그널)
        fresh: { DEFAULT: "#059669", tint: "#ECFDF5" },
        soon: { DEFAULT: "#F59E0B", tint: "#FEF3C7" },
        urgent: { DEFAULT: "#EF4444", tint: "#FEE2E2" },

        // 냉장고 냉기 — 존별 은은한 틴트 & 본체
        frost: { 50: "#F3F8FA", 100: "#E7F0F4", cool: "#EAF2F9" },
        steel: { DEFAULT: "#E2E8EC", line: "#CBD5DD", dark: "#64748B" },
      },
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          '"Malgun Gothic"',
          "sans-serif",
        ],
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "12px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(15,23,42,0.06)",
        DEFAULT: "0 2px 8px rgba(15,23,42,0.07)",
        md: "0 4px 14px rgba(15,23,42,0.09)",
        lg: "0 10px 28px rgba(15,23,42,0.12)",
      },
    },
  },
  plugins: [],
};
