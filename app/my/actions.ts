"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 로그아웃. 로그인하지 않은 상태에서 불러도 아무 일이 일어나지 않고 로그인 화면으로 간다.
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
