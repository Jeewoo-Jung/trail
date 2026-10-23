// Design Ref: PRD 5번(상향식 묶기) — 제안을 만들고, 승인·거절하는 저장소 쪽 일. 로그인한 사람의 연결로 쓰므로 "내 행만" 규칙이 걸린다.
// 제안은 내가 버튼을 눌렀을 때만 만든다(Claude 비용을 아끼려고 자동으로 돌리지 않는다). 승인한 것만 노드로 반영되고, 승인은 DB 함수 하나로 처리해 반쪽 적용이 남지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupAdvisor } from "../claude/group-advisor";
import { StoreError } from "../mcp/errors";
import { GROUP_LIMITS } from "../rules/limits";
import { checkApplyGroup, groupingBuckets, parseGroupAdvice, type GroupableNode, type GroupKind } from "../rules/grouping";
import { checkNodeInput, type NodeKind, type PortfolioStatus } from "../rules/nodes";
import type { EditResult } from "./node-edit";

type Row = { id: string; parent_id: string | null; kind: NodeKind; name: string; description: string; portfolio_status: PortfolioStatus; deleted_at: string | null };

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new StoreError(what, error.code);
}

async function loadGroupable(client: SupabaseClient): Promise<GroupableNode[]> {
  const { data, error } = await client.from("nodes").select("id, parent_id, kind, name, description, portfolio_status, deleted_at");
  check(error, "노드 읽기");
  return ((data ?? []) as Row[]).map((r) => ({ id: r.id, parentId: r.parent_id, kind: r.kind, name: r.name, description: r.description, portfolioStatus: r.portfolio_status, deletedAt: r.deleted_at }));
}

export type GenerateResult = { created: number; skipped: "no-candidates" | null };

/** 묶을 거리가 없으면 Claude를 부르지 않는다. 한 번에 후보 몇 곳만 보내 비용을 제한한다. */
export async function generateGroupProposals(client: SupabaseClient, advisor: GroupAdvisor): Promise<GenerateResult> {
  const nodes = await loadGroupable(client);
  const existing = await client.from("group_proposals").select("signature, status, child_node_ids");
  check(existing.error, "기존 제안 읽기");
  const known = new Set((existing.data ?? []).map((r) => r.signature as string));
  const pending = new Set((existing.data ?? []).filter((r) => r.status === "proposed").flatMap((r) => r.child_node_ids as string[]));

  const buckets = groupingBuckets(nodes, pending).slice(0, GROUP_LIMITS.maxBucketsPerRun);
  if (buckets.length === 0) return { created: 0, skipped: "no-candidates" };

  const names = new Map(nodes.map((n) => [n.id, n.name]));
  const rows: { child_node_ids: string[]; suggested_name: string; suggested_kind: GroupKind; signature: string }[] = [];
  for (const bucket of buckets) {
    const raw = await advisor({ bucket, parentName: bucket.parentId ? (names.get(bucket.parentId) ?? null) : null });
    for (const d of parseGroupAdvice(raw, bucket, known)) {
      known.add(d.signature);
      rows.push({ child_node_ids: d.childIds, suggested_name: d.name, suggested_kind: d.kind, signature: d.signature });
    }
  }
  if (rows.length === 0) return { created: 0, skipped: null };
  const { error } = await client.from("group_proposals").upsert(rows, { onConflict: "user_id,signature", ignoreDuplicates: true });
  check(error, "제안 저장");
  return { created: rows.length, skipped: null };
}

/** 승인: 이름을 고쳐서 승인할 수 있다. 노드가 그새 바뀌었으면 막는다. 새 상위 노드의 id를 돌려준다. */
export async function approveGroupProposal(client: SupabaseClient, id: string, rawName: unknown): Promise<EditResult> {
  const { data: p, error } = await client.from("group_proposals").select("child_node_ids, suggested_kind, suggested_name, status").eq("id", id).maybeSingle();
  check(error, "제안 읽기");
  if (!p || p.status !== "proposed") return { ok: false, message: "이미 처리됐거나 없는 제안입니다." };
  const kind = p.suggested_kind as GroupKind;
  const checkedName = checkNodeInput({ kind, name: typeof rawName === "string" && rawName.trim() !== "" ? rawName : p.suggested_name });
  if (!checkedName.ok) return { ok: false, message: checkedName.message };
  const applicable = checkApplyGroup(await loadGroupable(client), p.child_node_ids as string[], kind);
  if (!applicable.ok) return { ok: false, message: applicable.message };
  const res = await client.rpc("apply_group_proposal", { p_id: id, p_name: checkedName.value.name });
  if (res.error) {
    if (/children_changed|proposal_not_found/.test(res.error.message)) return { ok: false, message: "묶으려던 노드가 그새 바뀌었습니다. 제안을 거절하고 새로 받아 주세요." };
    check(res.error, "묶기 승인");
  }
  return { ok: true, id: res.data as string, message: "새 상위 노드를 만들고 묶었습니다." };
}

export async function rejectGroupProposal(client: SupabaseClient, id: string): Promise<EditResult> {
  const { data, error } = await client.from("group_proposals").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", id).eq("status", "proposed").select("id");
  check(error, "제안 거절");
  return (data?.length ?? 0) > 0 ? { ok: true } : { ok: false, message: "이미 처리됐거나 없는 제안입니다." };
}
