// ClassifyStore를 Supabase로 구현한다. 로그인한 사람의 연결로 쓰므로 "내 행만" 규칙이 걸린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubConceptRef, TopConceptRef } from "../rules/classification";
import type { ClassificationCandidate } from "../rules/card";
import type { CardForClassification, ClassifyStore } from "./classify-store";
import { StoreError } from "./store";

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new StoreError(what, error.code);
}

export function createSupabaseClassifyStore(client: SupabaseClient): ClassifyStore {
  async function listIdsByStatus(status: "pending" | "waiting", limit: number, olderThanMs?: number): Promise<string[]> {
    let query = client.from("cards").select("id").eq("classification_status", status);
    if (olderThanMs !== undefined) query = query.lt("updated_at", new Date(Date.now() - olderThanMs).toISOString());
    const { data, error } = await query.order("created_at", { ascending: true }).limit(limit);
    check(error, "분류 대기 카드 읽기");
    return (data ?? []).map((r) => r.id);
  }

  return {
    async listTopConcepts(): Promise<TopConceptRef[]> {
      const { data, error } = await client.from("top_concepts").select("id, name").order("sort_order").order("name");
      check(error, "상위 개념 읽기");
      return (data ?? []).map((r) => ({ id: r.id, name: r.name }));
    },

    async listSubConcepts(): Promise<SubConceptRef[]> {
      const { data, error } = await client.from("sub_concepts").select("id, top_concept_id, name, status");
      check(error, "하위 개념 읽기");
      return (data ?? []).map((r) => ({ id: r.id, topId: r.top_concept_id, name: r.name, status: r.status }));
    },

    async getCard(id: string): Promise<CardForClassification | null> {
      const { data, error } = await client.from("cards").select("id, title, summary, keywords, evidence, candidates").eq("id", id).maybeSingle();
      check(error, "카드 읽기");
      if (!data) return null;
      return {
        id: data.id,
        title: data.title,
        summary: data.summary ?? "",
        keywords: data.keywords ?? [],
        evidence: Array.isArray(data.evidence) ? data.evidence : [],
        candidates: Array.isArray(data.candidates) ? (data.candidates as ClassificationCandidate[]) : [],
      };
    },

    async listPendingCardIds(limit: number, olderThanMs?: number): Promise<string[]> {
      return listIdsByStatus("pending", limit, olderThanMs);
    },

    async listWaitingCardIds(limit: number): Promise<string[]> {
      return listIdsByStatus("waiting", limit);
    },

    async createSubProposal(topId: string, name: string): Promise<string> {
      const inserted = await client.from("sub_concepts").insert({ top_concept_id: topId, name, status: "proposed" }).select("id").single();
      if (!inserted.error) return inserted.data.id;
      if (inserted.error.code !== "23505") throw new StoreError("하위 개념 제안 저장", inserted.error.code);
      // 동시에 같은 이름이 제안된 경우: 이미 있는 것을 쓴다.
      const found = await client.from("sub_concepts").select("id").eq("top_concept_id", topId).eq("name", name).single();
      check(found.error, "하위 개념 읽기");
      return found.data!.id;
    },

    async saveClassification(cardId: string, topId: string | null, subId: string | null): Promise<void> {
      const { error } = await client
        .from("cards")
        .update({ top_concept_id: topId, sub_concept_id: subId, classification_status: "done" })
        .eq("id", cardId);
      check(error, "분류 저장");
    },

    async markWaiting(cardId: string): Promise<void> {
      const { error } = await client.from("cards").update({ classification_status: "waiting" }).eq("id", cardId);
      check(error, "대기 표시");
    },
  };
}
