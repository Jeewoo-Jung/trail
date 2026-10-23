// Design Ref: DESIGN.md §14.5 — 로그인한 사람의 연결로 노드·항목·근거·산출물·제안을 읽어 화면용 데이터로 만든다. "내 행만" 규칙이 걸린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError } from "../mcp/errors";
import type { Evidence, NodeKind, NodeLockable, PortfolioStatus, StarField, Subject } from "../rules/nodes";
import type { NodeData } from "../rules/node-tree";

// 읽어 오는 줄의 모양(Supabase 클라이언트에 데이터베이스 타입을 주지 않아서 여기서 한 번 적어 둔다)
type NodeDb = { id: string; parent_id: string | null; kind: NodeKind; name: string; description: string; start_date: string | null; end_date: string | null; portfolio_status: PortfolioStatus; locked_fields: NodeLockable[] | null; result_state: "empty" | "snoozed" | "not_applicable" | "filled"; result_snooze_until: string | null; result_asked_at: string | null; sort_order: number; created_by: "ai" | "user"; deleted_at: string | null; updated_at: string };
type FieldDb = { node_id: string; field: StarField; text: string; subject: Subject; locked: boolean; updated_by: "ai" | "user"; updated_at: string };
type EvidenceDb = { id: string; node_id: string; field: StarField; conversation_title: string; conversation_date: string; excerpt: string };
type OutputDb = { id: string; node_id: string; name: string; url: string | null; storage_path: string | null; is_final: boolean };
type SuggestionDb = { id: string; node_id: string; field: StarField; text: string; subject: Subject; evidence: Evidence[] | null; created_at: string };
type ProposalDb = { id: string; child_node_ids: string[] | null; suggested_name: string; suggested_kind: "category" | "project"; created_at: string };

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new StoreError(what, error.code);
}

// Supabase는 한 번에 최대 1000줄만 돌려주고 넘으면 오류 없이 잘라 버린다. 항목·근거가 많아져도 빠지지 않게 1000줄씩 나눠 끝까지 읽는다.
const PAGE = 1000;
type Page<T> = PromiseLike<{ data: T[] | null; error: { code?: string } | null }>;
export async function readAll<T>(what: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    check(error, what);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

export async function loadNodeData(client: SupabaseClient): Promise<NodeData> {
  const [nodes, fields, evidence, outputs, suggestions, proposals] = await Promise.all([
    readAll<NodeDb>("노드 읽기", (f, t) => client.from("nodes").select("id, parent_id, kind, name, description, start_date, end_date, portfolio_status, locked_fields, result_state, result_snooze_until, result_asked_at, sort_order, created_by, deleted_at, updated_at").order("id").range(f, t)),
    readAll<FieldDb>("항목 읽기", (f, t) => client.from("node_fields").select("node_id, field, text, subject, locked, updated_by, updated_at").order("node_id").order("field").range(f, t)),
    readAll<EvidenceDb>("근거 읽기", (f, t) => client.from("evidence").select("id, node_id, field, conversation_title, conversation_date, excerpt").order("created_at").order("id").range(f, t)),
    readAll<OutputDb>("산출물 읽기", (f, t) => client.from("outputs").select("id, node_id, name, url, storage_path, is_final").order("created_at").order("id").range(f, t)),
    readAll<SuggestionDb>("제안 읽기", (f, t) => client.from("field_suggestions").select("id, node_id, field, text, subject, evidence, created_at").eq("status", "proposed").order("created_at").order("id").range(f, t)),
    readAll<ProposalDb>("묶기 제안 읽기", (f, t) => client.from("group_proposals").select("id, child_node_ids, suggested_name, suggested_kind, created_at").eq("status", "proposed").order("created_at").order("id").range(f, t)),
  ]);
  return {
    nodes: nodes.map((r) => ({
      id: r.id, parentId: r.parent_id, kind: r.kind, name: r.name, description: r.description, startDate: r.start_date, endDate: r.end_date,
      portfolioStatus: r.portfolio_status, lockedFields: r.locked_fields ?? [], resultState: r.result_state, resultSnoozeUntil: r.result_snooze_until, resultAskedAt: r.result_asked_at, sortOrder: r.sort_order, createdBy: r.created_by, deletedAt: r.deleted_at, updatedAt: r.updated_at,
    })),
    fields: fields.map((r) => ({ nodeId: r.node_id, field: r.field, text: r.text, subject: r.subject, locked: r.locked, updatedBy: r.updated_by, updatedAt: r.updated_at })),
    evidence: evidence.map((r) => ({ id: r.id, nodeId: r.node_id, field: r.field, conversationTitle: r.conversation_title, conversationDate: r.conversation_date, excerpt: r.excerpt })),
    outputs: outputs.map((r) => ({ id: r.id, nodeId: r.node_id, name: r.name, url: r.url, storagePath: r.storage_path, isFinal: r.is_final })),
    suggestions: suggestions.map((r) => ({ id: r.id, nodeId: r.node_id, field: r.field, text: r.text, subject: r.subject, evidence: Array.isArray(r.evidence) ? r.evidence : [], createdAt: r.created_at })),
    proposals: proposals.map((r) => ({ id: r.id, childIds: r.child_node_ids ?? [], name: r.suggested_name, kind: r.suggested_kind, createdAt: r.created_at })),
  };
}
