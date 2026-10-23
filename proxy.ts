// Design Ref: DESIGN.md §6.2 — `/my`와 `/oauth`의 요청마다 로그인 상태를 새로 고치고, 로그인하지 않았으면 로그인 화면으로 보낸다.
// 공개 샘플 화면 `/`에는 적용하지 않는다. 여기서는 "빠른 확인"만 하고, 진짜 확인은 각 화면이 다시 한다.
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { updateSession } from "@/lib/supabase/proxy";

/** 새로 고친 로그인 쿠키를 그대로 실어서 다른 주소로 보낸다. */
function redirectKeepingCookies(response: NextResponse, target: URL): NextResponse {
  const redirect = NextResponse.redirect(target);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(name);
    if (value) redirect.headers.set(name, value);
  }
  return redirect;
}

export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const needsLogin = pathname === "/my" || pathname.startsWith("/my/") || pathname.startsWith("/oauth/");
  if (needsLogin && !signedIn) {
    const target = new URL("/login", request.url);
    target.searchParams.set("next", `${pathname}${search}`);
    return redirectKeepingCookies(response, target);
  }

  if (pathname === "/login" && signedIn) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return redirectKeepingCookies(response, new URL(next, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/my/:path*", "/oauth/:path*", "/login"],
};
