// Design Ref: DESIGN.md §5 — CardStore를 Supabase로 구현한다.
// 로그인한 사람의 연결(client)을 받아서 쓰므로, 모든 읽기·쓰기에 "내 행만" 규칙(RLS)이 그대로 걸린다.
// 오류에는 어떤 일이었는지와 코드만 담는다. 데이터베이스 오류 문구에는 카드 내용이 섞일 수 있어서 옮기지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassificationCandidate } from "../rules/card";
import { cleanTopicList } from "../rules/topic";
import {
  type CardContent,
  type CardStore,
  type CardSummary,
  type ConceptLists,
  type ConversationInfo,
  type Exclusions,
  type StoredCard,
  StoreError,
} from "./store";

type Row = Record<string, unknown>;
type DbError = { code?: string } | null;

function check(error: DbError, what: string): void {
  if (error) throw new StoreError(what, error.code);
}

function toStoredCard(row: Row): StoredCard {
  return {
    id: String(row.id),
    conversationKey: String(row.conversation_key),
    topicKey: String(row.topic_key),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
    candidates: Array.isArray(row.candidates) ? (row.candidates as ClassificationCandidate[]) : [],
    projectTopic: typeof row.project_topic === "string" ? row.project_topic : null,
  };
}

function toColumns(card: CardContent) {
  return {
    topic_key: card.topicKey,
    title: card.title,
    summary: card.summary,
    keywords: card.keywords,
    evidence: card.evidence,
    candidates: card.candidates,
    project_topic: card.projectTopic ?? null,
  };
}

export function createSupabaseCardStore(client: SupabaseClient): CardStore {
  const store: CardStore = {
    async getExclusions(): Promise<Exclusions> {
      const { data, error } = await client.from("settings").select("always_excluded, blocked").maybeSingle();
      check(error, "제외 목록 읽기");
      return { alwaysExcluded: data?.always_excluded ?? [], blocked: data?.blocked ?? [] };
    },

    async addAlwaysExcluded(topics: string[]): Promise<void> {
      const current = await store.getExclusions();
      const merged = cleanTopicList([...current.alwaysExcluded, ...topics]);
      // user_id는 데이터베이스가 로그인한 사람의 번호로 채우고, 같은 사람의 행이 있으면 그 행을 고친다.
      const { error } = await client
        .from("settings")
        .upsert({ always_excluded: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      check(error, "제외 목록 저장");
    },

    async getConversation(key: string): Promise<ConversationInfo | null> {
      const { data, error } = await client.from("conversations").select("key, card_count").eq("key", key).maybeSingle();
      check(error, "대화 읽기");
      return data ? { key: data.key, cardCount: data.card_count } : null;
    },

    async openConversation(key: string | undefined, questionCount: number): Promise<ConversationInfo | null> {
      if (key === undefined) {
        const { data, error } = await client
          .from("conversations")
          .insert({ question_count: questionCount })
          .select("key, card_count")
          .single();
        check(error, "대화 만들기");
        return { key: data!.key, cardCount: data!.card_count };
      }
      const { data, error } = await client
        .from("conversations")
        .select("key, card_count, question_count")
        .eq("key", key)
        .maybeSingle();
      check(error, "대화 읽기");
      if (!data) return null;
      if (questionCount > data.question_count) {
        const update = await client.from("conversations").update({ question_count: questionCount }).eq("key", key);
        check(update.error, "질문 횟수 저장");
      }
      return { key: data.key, cardCount: data.card_count };
    },

    async findCardById(id: string): Promise<StoredCard | null> {
      const { data, error } = await client.from("cards").select("*").eq("id", id).maybeSingle();
      // uuid 모양이 아닌 id는 데이터베이스가 형식 오류(22P02)를 내는데, "찾지 못함"과 같게 다룬다.
      if (error?.code === "22P02") return null;
      check(error, "카드 읽기");
      return data ? toStoredCard(data) : null;
    },

    async findCardByTopic(conversationKey: string, topicKey: string): Promise<StoredCard | null> {
      const { data, error } = await client
        .from("cards")
        .select("*")
        .eq("conversation_key", conversationKey)
        .eq("topic_key", topicKey)
        .maybeSingle();
      check(error, "카드 읽기");
      return data ? toStoredCard(data) : null;
    },

    async insertCard(conversationKey: string, card: CardContent): Promise<{ id: string }> {
      const { data, error } = await client
        .from("cards")
        .insert({ conversation_key: conversationKey, ...toColumns(card) })
        .select("id")
        .single();
      check(error, "카드 저장");
      return { id: data!.id };
    },

    async updateCard(id: string, card: CardContent): Promise<void> {
      const { error } = await client
        .from("cards")
        .update({ ...toColumns(card), classification_status: "pending" })
        .eq("id", id);
      check(error, "카드 수정");
    },

    async listCards(conversationKey: string): Promise<CardSummary[]> {
      const { data, error } = await client
        .from("cards")
        .select("id, topic_key, title")
        .eq("conversation_key", conversationKey)
        .order("created_at", { ascending: true });
      check(error, "카드 목록 읽기");
      return (data ?? []).map((row) => ({ id: row.id, topicKey: row.topic_key, title: row.title }));
    },

    async listConcepts(): Promise<ConceptLists> {
      const top = await client.from("top_concepts").select("name").order("sort_order").order("name");
      check(top.error, "상위 개념 읽기");
      const sub = await client
        .from("sub_concepts")
        .select("name, top_concepts(name)")
        .eq("status", "approved")
        .order("name");
      check(sub.error, "하위 개념 읽기");
      return {
        topConcepts: (top.data ?? []).map((row) => row.name),
        approvedSubConcepts: (sub.data ?? []).flatMap((row) => {
          const parent = row.top_concepts as unknown as { name: string } | { name: string }[] | null;
          const topName = Array.isArray(parent) ? parent[0]?.name : parent?.name;
          return topName ? [{ top: topName, name: row.name }] : [];
        }),
      };
    },
  };
  return store;
}
