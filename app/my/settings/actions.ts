"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseBlockedInput } from "@/lib/rules/settings";
import { createClient } from "@/lib/supabase/server";

export async function saveBlocked(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const raw = formData.get("blocked");
  const parsed = parseBlockedInput(typeof raw === "string" ? raw : "");
  if (!parsed.ok) redirect(`/my/settings?error=${encodeURIComponent(parsed.message)}`);

  const supabase = await createClient();
  // user_id는 데이터베이스가 로그인한 사람의 번호로 채운다. 같은 사람의 행이 있으면 blocked만 고친다(항상 제외 목록은 그대로).
  const { error } = await supabase.from("settings").upsert({ blocked: parsed.topics, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    console.error("[settings] 저장 실패", error.code);
    redirect("/my/settings?error=" + encodeURIComponent("저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요."));
  }
  redirect("/my/settings?saved=1");
}
