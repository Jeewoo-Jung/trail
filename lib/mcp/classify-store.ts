// Design Ref: DESIGN.md §4.5 — 분류에 필요한 저장소 접근을 인터페이스로 분리한다(시험에서는 가짜로 대신 넣는다).
import type { ClassificationCandidate } from "../rules/card";
import type { ConceptRef } from "../rules/classification";

export type CardForClassification = {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  evidence: string[];
  candidates: ClassificationCandidate[];
};

export interface ClassifyStore {
  /** 모든 개념(승인·제안·거절). 거절한 이름을 다시 만들지 않으려면 거절된 것도 필요하다. */
  listConcepts(): Promise<ConceptRef[]>;
  getCard(id: string): Promise<CardForClassification | null>;
  /** 분류 상태가 pending(분류 중)인 카드 id를 오래된 것부터 limit개. olderThanMs를 주면 그보다 오래 "분류 중"에 머문 카드만(작업이 중간에 끊겨 남은 카드를 찾을 때). */
  listPendingCardIds(limit: number, olderThanMs?: number): Promise<string[]>;
  /** 분류 상태가 waiting인 카드 id를 오래된 것부터 limit개. */
  listWaitingCardIds(limit: number): Promise<string[]>;
  /** 부모(없으면 뿌리) 아래에 새 개념을 "제안" 상태로 만든다. 같은 이름이 이미 있으면 그 id를 돌려준다. */
  createConcept(parentId: string | null, name: string): Promise<string>;
  /** 카드를 개념에 붙이고 분류를 끝낸 것으로 표시한다. conceptId가 null이면 미분류로 확정한다. */
  saveClassification(cardId: string, conceptId: string | null): Promise<void>;
  markWaiting(cardId: string): Promise<void>;
}
