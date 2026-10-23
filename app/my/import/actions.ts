"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClaudeRecommender } from "@/lib/claude/concept-recommender";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recommendFromDigest, saveApproved, type RecommendResult, type SaveResult } from "@/lib/my/import-apply";
import { createClient } from "@/lib/supabase/server";

// 대화 요약(브라우저에서 줄인 것)으로 추천을 받는다. 서버에서 요약을 다시 검사하고, 결과는 저장하지 않고 화면에만 돌려준다.
export async function recommend(rawDigest: unknown): Promise<RecommendResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, message: "Claude API 키가 설정되지 않았습니다." };
  try {
    return await recommendFromDigest(await createClient(), createClaudeRecommender(apiKey), rawDigest);
  } catch {
    console.error("[import] 추천 실패");
    return { ok: false, message: "추천을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요. (월 한도에 닿았을 수도 있습니다.)" };
  }
}

// 내가 승인한 항목만 저장한다. 상위 개념은 모두 합쳐 10개까지, 이미 있는 것은 건너뛴다.
export async function saveApprovedItems(topConcepts: string[], projectTopics: string[]): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!Array.isArray(topConcepts) || !Array.isArray(projectTopics) || [...topConcepts, ...projectTopics].some((x) => typeof x !== "string")) {
    return { ok: false, message: "저장할 항목의 모양이 올바르지 않습니다." };
  }
  try {
    const result = await saveApproved(await createClient(), topConcepts, projectTopics);
    revalidatePath("/my");
    return result;
  } catch {
    console.error("[import] 저장 실패");
    return { ok: false, message: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }
}
