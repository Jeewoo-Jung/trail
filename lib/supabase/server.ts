// 서버(화면·서버 함수)에서 쓰는 Supabase 연결. 로그인 정보는 쿠키에서 읽는다.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 화면(서버 컴포넌트)에서는 쿠키를 쓸 수 없다. proxy.ts가 매 요청마다 갱신하므로 무시해도 된다.
        }
      },
    },
  });
}
