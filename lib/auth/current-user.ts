// 서버에서 "지금 로그인한 사람이 누구인지" 알아내는 한 곳. (DESIGN.md §4.2, Next.js 문서의 Data Access Layer)
// 서명을 확인하는 getClaims만 쓴다. 쿠키에 든 정보를 그대로 믿으면 안 된다.
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
