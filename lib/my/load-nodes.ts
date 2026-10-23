// Design Ref: DESIGN.md §14.5 — 로그인한 사람의 연결로 노드·항목·근거·산출물·제안을 읽어 화면용 데이터로 만든다. "내 행만" 규칙이 걸린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError } from "../mcp/errors";
import type { NodeData } from "../rules/node-tree";

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new StoreError(what, error.code);
}

export async function loadNodeData(client: SupabaseClient): Promise<NodeData> {
  const [nodes, fields, evidence, outputs, suggestions, proposals] = await Promise.all([
    client.from("nodes").select("id, parent_id, kind, name, description, start_date, end_date, portfolio_status, locked_fields, result_state, sort_order, created_by, deleted_at, updated_at"),
    client.from("node_fields").select("node_id, field, text, subject, locked, updated_by"),
    client.from("evidence").select("id, node_id, field, conversation_title, conversation_date, excerpt").order("created_at"),
    client.from("outputs").select("id, node_id, name, url, storage_path, is_final").order("created_at"),
    client.from("field_suggestions").select("id, node_id, field, text, subject, evidence, created_at").eq("status", "proposed").order("created_at"),
    client.from("group_proposals").select("id, child_node_ids, suggested_name, suggested_kind, created_at").eq("status", "proposed").order("created_at"),
  ]);
  check(nodes.error, "노드 읽기");
  check(fields.error, "항목 읽기");
  check(evidence.error, "근거 읽기");
  check(outputs.error, "산출물 읽기");
  check(suggestions.error, "제안 읽기");
  check(proposals.error, "묶기 제안 읽기");
  return {
    nodes: (nodes.data ?? []).map((r) => ({
      id: r.id, parentId: r.parent_id, kind: r.kind, name: r.name, description: r.description, startDate: r.start_date, endDate: r.end_date,
      portfolioStatus: r.portfolio_status, lockedFields: r.locked_fields ?? [], resultState: r.result_state, sortOrder: r.sort_order, createdBy: r.created_by, deletedAt: r.deleted_at, updatedAt: r.updated_at,
    })),
    fields: (fields.data ?? []).map((r) => ({ nodeId: r.node_id, field: r.field, text: r.text, subject: r.subject, locked: r.locked, updatedBy: r.updated_by })),
    evidence: (evidence.data ?? []).map((r) => ({ id: r.id, nodeId: r.node_id, field: r.field, conversationTitle: r.conversation_title, conversationDate: r.conversation_date, excerpt: r.excerpt })),
    outputs: (outputs.data ?? []).map((r) => ({ id: r.id, nodeId: r.node_id, name: r.name, url: r.url, storagePath: r.storage_path, isFinal: r.is_final })),
    suggestions: (suggestions.data ?? []).map((r) => ({ id: r.id, nodeId: r.node_id, field: r.field, text: r.text, subject: r.subject, evidence: Array.isArray(r.evidence) ? r.evidence : [], createdAt: r.created_at })),
    proposals: (proposals.data ?? []).map((r) => ({ id: r.id, childIds: r.child_node_ids ?? [], name: r.suggested_name, kind: r.suggested_kind, createdAt: r.created_at })),
  };
}
