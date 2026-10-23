"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ wait: z.coerce.number().int().min(1).max(365), snooze: z.coerce.number().int().min(1).max(90) });

export async function saveResultDays(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = schema.safeParse({ wait: formData.get("wait_days"), snooze: formData.get("snooze_days") });
  if (!parsed.success) redirect(`/my/settings?error=${encodeURIComponent("일수는 정수로, 범위 안에서 입력해 주세요.")}`);
  const supabase = await createClient();
  // user_id는 데이터베이스가 로그인한 사람의 번호로 채운다. 같은 사람의 행이 있으면 이 두 값만 고친다.
  const { error } = await supabase.from("settings").upsert({ result_wait_days: parsed.data.wait, result_snooze_days: parsed.data.snooze, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    console.error("[settings] 저장 실패", error.code);
    redirect(`/my/settings?error=${encodeURIComponent("저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.")}`);
  }
  redirect("/my/settings?saved=1");
}
