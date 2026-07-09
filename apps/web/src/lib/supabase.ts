import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경 변수가 없음. .env 에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 설정할 것."
  );
}

// PKCE 플로우: OAuth 콜백이 해시(#access_token)가 아닌 ?code= 로 돌아와
// exchangeCodeForSession으로 교환된다(implicit의 '부분 해시 → 세션 미검출' 문제 회피).
// detectSessionInUrl로 콜백 URL을 자동 처리하고, 세션은 로컬스토리지에 유지한다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    debug: import.meta.env.DEV, // 개발 중 콜백/교환 실패 원인을 콘솔에 출력
  },
});

// 개발 진단용: 콘솔에서 supabase.auth.* 를 직접 호출해 콜백/교환 에러를 확인.
if (import.meta.env.DEV) {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}
