"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isOwner, isValidAuthorizationId } from "@/lib/auth/consent";
import { createClient } from "@/lib/supabase/server";

// 승인·거절 모두 서버에서 다시 로그인과 "내 계정인지"를 확인한다. 화면의 버튼만 믿지 않는다.
async function decide(formData: FormData, approve: boolean) {
  const id = formData.get("authorization_id");
  if (!isValidAuthorizationId(id)) redirect("/oauth/consent?error=1");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // 내 계정이 아니면 승인할 수 없다. 거절은 누구든 할 수 있다.
  if (approve && !isOwner(user.id, process.env.OWNER_USER_ID)) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=owner`);

  const supabase = await createClient();
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(id)
    : await supabase.auth.oauth.denyAuthorization(id);
  if (error || !data?.redirect_url) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=1`);
  redirect(data.redirect_url);
}

export async function approve(formData: FormData) {
  await decide(formData, true);
}

export async function deny(formData: FormData) {
  await decide(formData, false);
}
