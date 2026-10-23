// Design Ref: DESIGN.md §14 — NodeStore를 Supabase로 구현한다.
// 로그인한 사람의 연결(client)을 받아서 쓰므로, 모든 읽기·쓰기에 "내 행만" 규칙(RLS)이 그대로 걸린다.
// 오류에는 어떤 일이었는지와 코드만 담는다. 데이터베이스 오류 문구에는 내용이 섞일 수 있어서 옮기지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Evidence, NodeKind, NodeLockable, PortfolioStatus, StarField, Subject } from "../rules/nodes";
import type { ConversationInfo, NodeStore, StoredField, StoredNode } from "./node-store";
import { StoreError } from "./store";

type DbError = { code?: string } | null;
function check(error: DbError, what: string): void {
  if (error) throw new StoreError(what, error.code);
}

export function createSupabaseNodeStore(client: SupabaseClient): NodeStore {
  return {
    async openConversation(key: string | undefined, questionCount: number): Promise<ConversationInfo | null> {
      if (key === undefined) {
        const { data, error } = await client.from("conversations").insert({ question_count: questionCount }).select("key, question_count").single();
        check(error, "대화 만들기");
        return { key: data!.key, questionCount: data!.question_count };
      }
      const { data, error } = await client.from("conversations").select("key, question_count").eq("key", key).maybeSingle();
      check(error, "대화 읽기");
      if (!data) return null;
      if (questionCount > data.question_count) {
        const update = await client.from("conversations").update({ question_count: questionCount }).eq("key", key);
        check(update.error, "질문 횟수 저장");
        return { key: data.key, questionCount };
      }
      return { key: data.key, questionCount: data.question_count };
    },

    async listAskedTopics(conversationKey: string): Promise<string[]> {
      const { data, error } = await client.from("topic_questions").select("topic_key").eq("conversation_key", conversationKey).order("asked_at");
      check(error, "질문 기록 읽기");
      return (data ?? []).map((r) => r.topic_key as string);
    },

    async markTopicAsked(conversationKey: string, topicKey: string): Promise<void> {
      const { error } = await client.from("topic_questions").upsert({ conversation_key: conversationKey, topic_key: topicKey }, { onConflict: "conversation_key,topic_key", ignoreDuplicates: true });
      check(error, "질문 기록 저장");
    },

    async listNodes(): Promise<StoredNode[]> {
      const { data, error } = await client.from("nodes").select("id, parent_id, kind, name, description, start_date, end_date, portfolio_status, locked_fields, deleted_at, updated_at");
      check(error, "노드 읽기");
      return (data ?? []).map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        kind: r.kind as NodeKind,
        name: r.name,
        description: r.description,
        startDate: r.start_date,
        endDate: r.end_date,
        portfolioStatus: r.portfolio_status as PortfolioStatus,
        lockedFields: (r.locked_fields ?? []) as NodeLockable[],
        deletedAt: r.deleted_at,
        updatedAt: r.updated_at,
      }));
    },

    async insertNode(n): Promise<{ id: string }> {
      const { data, error } = await client
        .from("nodes")
        .insert({ parent_id: n.parentId, kind: n.kind, name: n.name, description: n.description, start_date: n.startDate, end_date: n.endDate, created_by: "ai" })
        .select("id")
        .single();
      check(error, "노드 저장");
      return { id: data!.id };
    },

    async updateNodePeriod(id: string, startDate: string | null, endDate: string | null): Promise<void> {
      const { error } = await client.from("nodes").update({ start_date: startDate, end_date: endDate }).eq("id", id);
      check(error, "기간 저장");
    },

    async listFields(nodeId: string): Promise<StoredField[]> {
      const { data, error } = await client.from("node_fields").select("field, text, locked").eq("node_id", nodeId);
      check(error, "항목 읽기");
      return (data ?? []).map((r) => ({ field: r.field as StarField, text: r.text, locked: r.locked }));
    },

    async upsertField(nodeId: string, field: StarField, text: string, subject: Subject): Promise<void> {
      const { error } = await client.from("node_fields").upsert({ node_id: nodeId, field, text, subject, updated_by: "ai", updated_at: new Date().toISOString() }, { onConflict: "node_id,field" });
      check(error, "항목 저장");
    },

    async countEvidence(nodeId: string, field: StarField): Promise<number> {
      const { count, error } = await client.from("evidence").select("id", { count: "exact", head: true }).eq("node_id", nodeId).eq("field", field);
      check(error, "근거 세기");
      return count ?? 0;
    },

    async insertEvidence(nodeId: string, field: StarField, evidence: readonly Evidence[]): Promise<void> {
      if (evidence.length === 0) return;
      const { error } = await client.from("evidence").insert(evidence.map((e) => ({ node_id: nodeId, field, conversation_title: e.conversationTitle, conversation_date: e.conversationDate, excerpt: e.excerpt })));
      check(error, "근거 저장");
    },

    async listOpenSuggestions(nodeId: string): Promise<{ field: StarField; text: string }[]> {
      const { data, error } = await client.from("field_suggestions").select("field, text").eq("node_id", nodeId).eq("status", "proposed");
      check(error, "제안 읽기");
      return (data ?? []).map((r) => ({ field: r.field as StarField, text: r.text }));
    },

    async insertSuggestion(s): Promise<void> {
      const { error } = await client.from("field_suggestions").insert({ node_id: s.nodeId, field: s.field, text: s.text, subject: s.subject, evidence: s.evidence, source_conversation_key: s.conversationKey });
      check(error, "제안 저장");
    },

    async listOutputs(nodeId: string): Promise<{ name: string; url: string | null }[]> {
      const { data, error } = await client.from("outputs").select("name, url").eq("node_id", nodeId);
      check(error, "산출물 읽기");
      return (data ?? []).map((r) => ({ name: r.name, url: r.url }));
    },

    async insertOutput(nodeId: string, name: string, url: string | null): Promise<void> {
      const { error } = await client.from("outputs").insert({ node_id: nodeId, name, url });
      check(error, "산출물 저장");
    },
  };
}
