// Design Ref: PRD 5 should(트리 정리 제안) — 제안을 만들고, 승인·거절하는 저장소 쪽 일. 로그인한 사람의 연결로 쓰므로 "내 행만" 규칙이 걸린다.
// 승인은 데이터베이스 함수(apply_tree_merge·apply_tree_split)가 한 번에 처리해서 중간에 멈춰도 반쪽 적용이 남지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Advisor } from "../claude/tree-advisor";
import { StoreError } from "../mcp/store";
import { hasProposalCandidates, parseAdvice, type SubContext, type TreeProposal } from "../rules/tree-proposals";

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new StoreError(what, error.code);
}

export async function loadSubContexts(client: SupabaseClient): Promise<SubContext[]> {
  const [tops, subs, cards] = await Promise.all([
    client.from("top_concepts").select("id, name"),
    client.from("sub_concepts").select("id, top_concept_id, name, status"),
    client.from("cards").select("id, title, sub_concept_id").not("sub_concept_id", "is", null),
  ]);
  check(tops.error, "상위 개념 읽기");
  check(subs.error, "하위 개념 읽기");
  check(cards.error, "카드 읽기");
  const topName = new Map((tops.data ?? []).map((t) => [t.id, t.name as string]));
  return (subs.data ?? []).map((s) => ({
    id: s.id,
    topId: s.top_concept_id,
    topName: topName.get(s.top_concept_id) ?? "",
    name: s.name,
    status: s.status,
    cards: (cards.data ?? []).filter((c) => c.sub_concept_id === s.id).map((c) => ({ id: c.id, title: c.title })),
  }));
}

export type GenerateResult = { created: number; skipped: "no-candidates" | null };

/** 제안할 거리가 없으면 Claude를 부르지 않는다. */
export async function generateProposals(client: SupabaseClient, advisor: Advisor): Promise<GenerateResult> {
  const subs = await loadSubContexts(client);
  if (!hasProposalCandidates(subs)) return { created: 0, skipped: "no-candidates" };

  const existing = await client.from("tree_proposals").select("signature");
  check(existing.error, "기존 제안 읽기");
  const known = new Set((existing.data ?? []).map((r) => r.signature as string));

  const proposals = parseAdvice(await advisor(subs), subs, known);
  if (proposals.length === 0) return { created: 0, skipped: null };
  const { error } = await client.from("tree_proposals").upsert(
    proposals.map((p) => ({ kind: p.kind, top_concept_id: p.topId, signature: p.signature, payload: p.payload })),
    { onConflict: "user_id,signature", ignoreDuplicates: true },
  );
  check(error, "제안 저장");
  return { created: proposals.length, skipped: null };
}

export type PendingProposal = { id: string; kind: TreeProposal["kind"]; payload: TreeProposal["payload"]; createdAt: string };

export async function listPendingProposals(client: SupabaseClient): Promise<PendingProposal[]> {
  const { data, error } = await client.from("tree_proposals").select("id, kind, payload, created_at").eq("status", "proposed").order("created_at");
  check(error, "제안 읽기");
  return (data ?? []).map((r) => ({ id: r.id, kind: r.kind, payload: r.payload, createdAt: r.created_at }));
}

/** 승인: 종류에 맞는 데이터베이스 함수를 부른다. 이미 처리됐거나 대상이 바뀌어 적용할 수 없으면 false. */
export async function approveProposal(client: SupabaseClient, id: string, kind: "merge" | "split"): Promise<boolean> {
  const { error } = await client.rpc(kind === "merge" ? "apply_tree_merge" : "apply_tree_split", { p_id: id });
  if (!error) return true;
  // 우리 함수가 던지는 정해진 사유(제안 없음·대상 없음)와 같은 이름 충돌만 "적용 불가"로 본다.
  if (/proposal_not_found|from_missing|into_missing|sub_missing|same_sub/.test(error.message) || error.code === "23505") return false;
  throw new StoreError("제안 승인", error.code);
}

export async function rejectProposal(client: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await client
    .from("tree_proposals")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "proposed")
    .select("id");
  check(error, "제안 거절");
  return (data?.length ?? 0) > 0;
}
