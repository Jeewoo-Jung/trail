// Design Ref: DESIGN.md §4.5 — 분류에 필요한 저장소 접근을 인터페이스로 분리한다(시험에서는 가짜로 대신 넣는다).
import type { ClassificationCandidate } from "../rules/card";
import type { SubConceptRef, TopConceptRef } from "../rules/classification";

export type CardForClassification = {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  evidence: string[];
  candidates: ClassificationCandidate[];
};

export interface ClassifyStore {
  listTopConcepts(): Promise<TopConceptRef[]>;
  /** 승인·제안·거절을 모두 돌려준다(거절한 이름을 다시 제안하지 않기 위해). */
  listSubConcepts(): Promise<SubConceptRef[]>;
  getCard(id: string): Promise<CardForClassification | null>;
  /** 분류 상태가 waiting인 카드 id를 오래된 것부터 limit개. */
  listWaitingCardIds(limit: number): Promise<string[]>;
  /** 같은 상위 개념 아래 같은 이름이 이미 있으면 그 id를 돌려준다. */
  createSubProposal(topId: string, name: string): Promise<string>;
  saveClassification(cardId: string, topId: string | null, subId: string | null): Promise<void>;
  markWaiting(cardId: string): Promise<void>;
}
