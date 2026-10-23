"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClaudeAdvisor } from "@/lib/claude/tree-advisor";
import { approveConcept as approveConceptRow, rejectConcept as rejectConceptRow } from "@/lib/my/proposals";
import { approveProposal, generateProposals, rejectProposal } from "@/lib/my/tree-proposals";
import { createClient } from "@/lib/supabase/server";

// 로그아웃. 로그인하지 않은 상태에서 불러도 아무 일이 일어나지 않고 로그인 화면으로 간다.
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// 새 개념(상위 개념 포함) 승인·거절. 가지째 처리한다. 서버에서 다시 로그인을 확인하고, 제안 상태인 것만 바꾼다. 데이터베이스의 "내 행만" 규칙도 걸려 있다.
async function decideConcept(formData: FormData, approve: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formData.get("concept_id");
  if (typeof id !== "string" || !z.uuid().safeParse(id).success) return;
  const supabase = await createClient();
  try {
    await (approve ? approveConceptRow : rejectConceptRow)(supabase, id);
  } catch {
    console.error("[my] 개념 승인·거절 실패");
  }
  revalidatePath("/my");
}

export async function approveConcept(formData: FormData) {
  await decideConcept(formData, true);
}

export async function rejectConcept(formData: FormData) {
  await decideConcept(formData, false);
}

// 잘못 기록된 카드 삭제. 카드 내용을 고치는 기능은 없고 삭제만 된다.
export async function deleteCard(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formData.get("card_id");
  if (typeof id !== "string" || !z.uuid().safeParse(id).success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) console.error("[my] 카드 삭제 실패", error.code);
  revalidatePath("/my");
}

// 트리 정리 제안(병합·분리). 제안은 내가 버튼을 눌렀을 때만 만든다(Claude 비용을 아끼려고 자동으로 돌리지 않는다).
export async function requestTreeProposals() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;
  try {
    await generateProposals(await createClient(), createClaudeAdvisor(apiKey));
  } catch {
    console.error("[my] 정리 제안 만들기 실패");
  }
  revalidatePath("/my");
}

export async function approveTreeProposal(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formData.get("proposal_id");
  const kind = formData.get("kind");
  if (typeof id !== "string" || !z.uuid().safeParse(id).success || (kind !== "merge" && kind !== "split")) return;
  try {
    await approveProposal(await createClient(), id, kind);
  } catch {
    console.error("[my] 정리 제안 승인 실패");
  }
  revalidatePath("/my");
}

export async function rejectTreeProposal(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formData.get("proposal_id");
  if (typeof id !== "string" || !z.uuid().safeParse(id).success) return;
  try {
    await rejectProposal(await createClient(), id);
  } catch {
    console.error("[my] 정리 제안 거절 실패");
  }
  revalidatePath("/my");
}
