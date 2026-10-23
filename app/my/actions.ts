"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { approveSubConcept, rejectSubConcept } from "@/lib/my/proposals";
import { createClient } from "@/lib/supabase/server";

// 로그아웃. 로그인하지 않은 상태에서 불러도 아무 일이 일어나지 않고 로그인 화면으로 간다.
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// 새 하위 개념 승인·거절. 서버에서 다시 로그인을 확인하고, 제안 상태인 것만 바꾼다. 데이터베이스의 "내 행만" 규칙도 걸려 있다.
async function decideSub(formData: FormData, approve: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formData.get("sub_id");
  if (typeof id !== "string" || !z.uuid().safeParse(id).success) return;
  const supabase = await createClient();
  await (approve ? approveSubConcept : rejectSubConcept)(supabase, id);
  revalidatePath("/my");
}

export async function approveSub(formData: FormData) {
  await decideSub(formData, true);
}

export async function rejectSub(formData: FormData) {
  await decideSub(formData, false);
}
