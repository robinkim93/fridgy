import { supabase } from "../../lib/supabase";

export function LoginScreen() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      alert(`로그인 실패: ${error.message}`);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-6xl">🧊</div>
      <div>
        <h1 className="text-3xl font-bold text-green-700">Fridgy</h1>
        <p className="mt-2 text-gray-500">냉장고 식재료 유통기한 관리</p>
        <p className="text-sm text-gray-400">· 임박 재료 레시피 추천</p>
      </div>

      <button
        onClick={handleGoogleLogin}
        className="w-full rounded-lg bg-white px-6 py-3 font-medium text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50"
      >
        Google 계정으로 로그인
      </button>

      <p className="text-xs text-gray-400">
        처음 방문하시나요?{" "}
        <span className="cursor-pointer text-blue-600 hover:underline">
          회원가입은 로그인과 동일합니다.
        </span>
      </p>
    </main>
  );
}
