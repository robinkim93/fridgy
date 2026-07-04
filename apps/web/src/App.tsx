import { useQuery } from "@tanstack/react-query";
import { getHealth } from "./lib/api";

// S0 골격: 로그인한 사용자가 도달하는 "빈 대시보드".
// 인증(Supabase Auth)·재고 UI는 S1 이후 붙는다. 지금은 API 연결 확인만.
export default function App() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    retry: false,
  });

  const apiStatus = isLoading
    ? "확인 중…"
    : isError
      ? "연결 안 됨"
      : `연결됨 (${data?.version})`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl">🧊</div>
      <h1 className="text-2xl font-bold text-green-700">Fridgy</h1>
      <p className="text-gray-500">냉장고 식재료 유통기한 관리 · 레시피 추천</p>
      <div className="rounded-lg border px-4 py-2 text-sm text-gray-600">
        API: <span className="font-medium">{apiStatus}</span>
      </div>
    </main>
  );
}
