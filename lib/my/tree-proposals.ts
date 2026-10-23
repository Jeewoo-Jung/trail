// Design Ref: PRD 5 should(트리 정리 제안) — 제안을 만들고, 승인·거절하는 저장소 쪽 일. 로그인한 사람의 연결로 쓰므로 "내 행만" 규칙이 걸린다.
// 승인은 데이터베이스 함수(apply_tree_merge·apply_tree_split)가 한 번에 처리해서 중간에 멈춰도 반쪽 적용이 남지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Advisor } from "../claude/tree-advisor";
import { StoreError } from "../mcp/store";
import { hasProposalCandidates, parseAdvice, type ConceptContext, type TreeProposal } from "../rules/tree-proposals";

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new StoreError(what, error.code);
}

export async function loadConceptContexts(client: SupabaseClient): Promise<ConceptContext[]> {
  const [concepts, cards] = await Promise.all([
    client.from("concepts").select("id, parent_id, name, status, depth"),
    client.from("cards").select("id, title, concept_id").not("concept_id", "is", null),
  ]);
  check(concepts.error, "개념 읽기");
  check(cards.error, "카드 읽기");
  const rows = concepts.data ?? [];
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const pathOf = (id: string): string[] => {
    const out: string[] = [];
    let cur: string | null = id;
    for (let i = 0; cur && i < 8; i += 1) {
      const r = byId.get(cur);
      if (!r) break;
      out.unshift(r.name as string);
      cur = r.parent_id as string | null;
    }
    return out;
  };
  return rows.map((r) => {
    const kids = rows.filter((k) => k.parent_id === r.id);
    return {
      id: r.id,
      parentId: r.parent_id,
      name: r.name,
      path: pathOf(r.id),
      status: r.status,
      depth: r.depth,
      childCount: kids.filter((k) => k.status !== "rejected").length,
      childNames: kids.map((k) => k.name as string),
      cards: (cards.data ?? []).filter((c) => c.concept_id === r.id).map((c) => ({ id: c.id, title: c.title })),
    };
  });
}

export type GenerateResult = { created: number; skipped: "no-candidates" | null };

/** 제안할 거리가 없으면 Claude를 부르지 않는다. */
export async function generateProposals(client: SupabaseClient, advisor: Advisor): Promise<GenerateResult> {
  const concepts = await loadConceptContexts(client);
  if (!hasProposalCandidates(concepts)) return { created: 0, skipped: "no-candidates" };

  const existing = await client.from("tree_proposals").select("signature");
  check(existing.error, "기존 제안 읽기");
  const known = new Set((existing.data ?? []).map((r) => r.signature as string));

  const proposals = parseAdvice(await advisor(concepts), concepts, known);
  if (proposals.length === 0) return { created: 0, skipped: null };
  const { error } = await client.from("tree_proposals").upsert(
    proposals.map((p) => ({ kind: p.kind, parent_concept_id: p.parentId, signature: p.signature, payload: p.payload })),
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
