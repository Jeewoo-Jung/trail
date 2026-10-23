"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

// 이메일과 비밀번호로 로그인한다. 가입 기능은 없다. (신규 가입은 Supabase에서 막는다.)
// 틀렸을 때는 이메일이 있는지 없는지 알 수 없게 같은 안내만 보여 준다. 입력값은 기록하지 않는다.
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
