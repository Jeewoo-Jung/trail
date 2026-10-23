// Design Ref: PRD 5 should(과거 대화 업로드 추천) — 요약으로 추천을 받고, 내가 승인한 것만 저장한다. 로그인한 사람의 연결로 쓰므로 "내 행만" 규칙이 걸린다.
// 추천 결과와 대화 요약은 저장하지 않는다. 저장되는 것은 내가 승인한 상위 개념 이름과 프로젝트 주제 이름뿐이다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Recommender } from "../claude/concept-recommender";
import { StoreError } from "../mcp/store";
import { checkDigest } from "../rules/import-digest";
import { checkApproved, parseRecommendation, type Recommendation } from "../rules/recommendation";
import { cleanTopicList } from "../rules/topic";

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new StoreError(what, error.code);
}

export async function loadExisting(client: SupabaseClient): Promise<{ tops: string[]; sortMax: number; topics: string[]; totalConcepts: number }> {
  const [concepts, settings] = await Promise.all([
    client.from("concepts").select("name, sort_order, parent_id"),
    client.from("settings").select("project_topics").maybeSingle(),
  ]);
  check(concepts.error, "개념 읽기");
  check(settings.error, "프로젝트 주제 읽기");
  const roots = (concepts.data ?? []).filter((r) => r.parent_id === null);
  return {
    // 뿌리(상위 개념) 이름들. 이미 있는 이름(제안·거절 포함)은 다시 추천하거나 저장하지 않는다.
    tops: roots.map((r) => r.name as string),
    sortMax: Math.max(-1, ...roots.map((r) => r.sort_order as number)),
    topics: settings.data?.project_topics ?? [],
    totalConcepts: (concepts.data ?? []).length,
  };
}

export type RecommendResult = { ok: true; recommendation: Recommendation } | { ok: false; message: string };

export async function recommendFromDigest(client: SupabaseClient, recommender: Recommender, rawDigest: unknown): Promise<RecommendResult> {
  const digest = checkDigest(rawDigest);
  if (!digest) return { ok: false, message: "대화 요약의 모양이나 크기가 올바르지 않습니다. 파일을 다시 골라 주세요." };
  const existing = await loadExisting(client);
  const recommendation = parseRecommendation(await recommender(digest, existing.tops, existing.topics), existing.tops, existing.topics);
  if (recommendation.topConcepts.length === 0 && recommendation.projectTopics.length === 0) {
    return { ok: false, message: "추천할 새 후보를 찾지 못했습니다. (이미 있는 것과 겹치거나, 대화가 너무 적을 수 있습니다.)" };
  }
  return { ok: true, recommendation };
}

export type SaveResult = { ok: true; savedTopConcepts: number; savedProjectTopics: number } | { ok: false; message: string };

export async function saveApproved(client: SupabaseClient, topConcepts: readonly string[], projectTopics: readonly string[]): Promise<SaveResult> {
  const existing = await loadExisting(client);
  const checked = checkApproved(topConcepts, projectTopics, existing.tops, existing.topics, existing.totalConcepts);
  if (!checked.ok) return checked;
  if (checked.topConcepts.length === 0 && checked.projectTopics.length === 0) return { ok: false, message: "저장할 새 항목이 없습니다." };

  // 상위 개념(뿌리)은 승인한 상태로 한 줄씩 넣는다. 그 사이 같은 이름이 생겼다면(23505) 건너뛴다.
  for (const [i, name] of checked.topConcepts.entries()) {
    const { error } = await client.from("concepts").insert({ parent_id: null, name, status: "approved", sort_order: existing.sortMax + 1 + i });
    if (error && error.code !== "23505") throw new StoreError("상위 개념 저장", error.code);
  }
  if (checked.projectTopics.length > 0) {
    const { error } = await client
      .from("settings")
      .upsert({ project_topics: cleanTopicList([...existing.topics, ...checked.projectTopics]), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    check(error, "프로젝트 주제 저장");
  }
  return { ok: true, savedTopConcepts: checked.topConcepts.length, savedProjectTopics: checked.projectTopics.length };
}
