// 서버에서 "지금 로그인한 사람이 누구인지" 알아내는 한 곳. (DESIGN.md §4.2, Next.js 문서의 Data Access Layer)
// 서명을 확인하는 getClaims만 쓴다. 쿠키에 든 정보를 그대로 믿으면 안 된다.
import { connection } from "next/server";
import { isOwner } from "@/lib/auth/consent";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // 로그인 서명 확인은 현재 시각(만료 시각 비교)을 쓴다. 요청이 들어온 뒤에만 실행되게 해서
  // Next.js의 "미리 그리는 중 시각을 쓰면 안 된다" 경고를 막는다.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  // 로그인했더라도 내 계정(OWNER_USER_ID)이 아니면 로그인하지 않은 것으로 본다. 설정이 비어 있으면 아무도 통과하지 못한다.
  if (!isOwner(claims.sub, process.env.OWNER_USER_ID)) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
