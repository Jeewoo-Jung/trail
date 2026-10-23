// Design Ref: DESIGN.md §6.2 — 요청마다 로그인 상태를 새로 고치고, 로그인했는지 알려 준다.
// 새로 고친 쿠키를 화면(서버 컴포넌트)과 브라우저 양쪽에 전달해야 로그인이 풀리지 않는다.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwner } from "../auth/consent";
import { supabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // 서명을 확인하는 getClaims를 쓴다. getSession은 서버에서 믿으면 안 된다.
  const { data } = await supabase.auth.getClaims();
  // 내 계정이 아니면 로그인하지 않은 것으로 본다(화면의 getCurrentUser와 같은 기준이라 서로 되돌려 보내는 일이 없다).
  const sub = data?.claims?.sub;
  return { response, signedIn: Boolean(sub) && isOwner(sub as string, process.env.OWNER_USER_ID) };
}
