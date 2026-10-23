// Design Ref: DESIGN.md §5·§6.1 — 카드를 저장하고 읽는 "약속". 기록·조회 로직은 이 약속에만 기대고,
// 실제 저장소(Supabase)와 시험용 가짜 저장소가 각자 이 약속을 지킨다. 그래서 규칙은 빠르게 시험하고 연결은 따로 확인한다.
import type { CheckedCard, ClassificationCandidate } from "../rules/card";

/** 저장소에 넣고 고치는 카드 내용 */
export type CardContent = Pick<
  CheckedCard,
  "topicKey" | "title" | "summary" | "keywords" | "evidence" | "candidates" | "projectTopic"
>;

export type StoredCard = {
  id: string;
  conversationKey: string;
  topicKey: string;
  title: string;
  summary: string;
  keywords: string[];
  evidence: string[];
  candidates: ClassificationCandidate[];
  projectTopic: string | null;
};

export type CardSummary = { id: string; topicKey: string; title: string };
export type ConversationInfo = { key: string; cardCount: number };
export type Exclusions = { alwaysExcluded: string[]; blocked: string[] };
export type ConceptLists = {
  topConcepts: string[];
  approvedSubConcepts: { top: string; name: string }[];
};

export interface CardStore {
  getExclusions(): Promise<Exclusions>;
  /** 내가 정한 프로젝트 주제 목록(앱 설정에 저장돼 있다). */
  getProjectTopics(): Promise<string[]>;
  /** "이 주제는 항상 제외"로 고른 주제를 더한다. 이미 있는 것과 겹치면 하나로 합친다. */
  addAlwaysExcluded(topics: string[]): Promise<void>;
  getConversation(key: string): Promise<ConversationInfo | null>;
  /** 키가 없으면 새 대화를 만들고, 있으면 기존 대화를 돌려준다(없는 키면 null). 질문 횟수는 더 큰 값을 유지한다. */
  openConversation(key: string | undefined, questionCount: number): Promise<ConversationInfo | null>;
  findCardById(id: string): Promise<StoredCard | null>;
  findCardByTopic(conversationKey: string, topicKey: string): Promise<StoredCard | null>;
  insertCard(conversationKey: string, card: CardContent): Promise<{ id: string }>;
  /** 내용을 고치고 분류 상태를 "분류 중"으로 되돌린다. */
  updateCard(id: string, card: CardContent): Promise<void>;
  listCards(conversationKey: string): Promise<CardSummary[]>;
  listConcepts(): Promise<ConceptLists>;
}

/** 저장소 오류. 메시지에는 어떤 일이었는지와 코드만 담고, 카드 내용은 담지 않는다. */
export class StoreError extends Error {
  constructor(
    what: string,
    readonly code?: string,
  ) {
    super(`${what} 실패${code ? ` (코드 ${code})` : ""}`);
    this.name = "StoreError";
  }
}
