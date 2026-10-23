// Design Ref: DESIGN.md §14 — 기록 도구가 노드·활동 카드를 저장하고 읽는 "약속". 규칙은 이 약속에만 기대고,
// 실제 저장소(Supabase)와 시험용 가짜 저장소가 각자 이 약속을 지킨다.
import type { Evidence, NodeKind, NodeLockable, NodeRef, StarField, Subject } from "../rules/nodes";

export type ConversationInfo = { key: string; questionCount: number };

export type StoredNode = NodeRef & {
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  lockedFields: NodeLockable[];
  updatedAt: string;
};

export type StoredField = { field: StarField; text: string; locked: boolean };

export interface NodeStore {
  /** 키가 없으면 새 대화를 만들고, 있으면 기존 대화를 돌려준다(없는 키면 null). 질문 횟수는 더 큰 값을 유지한다. */
  openConversation(key: string | undefined, questionCount: number): Promise<ConversationInfo | null>;
  /** 이 대화에서 이미 질문한 주제들 */
  listAskedTopics(conversationKey: string): Promise<string[]>;
  /** 주제 질문 기록(이미 있으면 그대로 둔다) */
  markTopicAsked(conversationKey: string, topicKey: string): Promise<void>;

  /** 휴지통의 것까지 모든 노드(개수 한도와 부모 검사에 쓴다) */
  listNodes(): Promise<StoredNode[]>;
  insertNode(node: { parentId: string | null; kind: NodeKind; name: string; description: string; startDate: string | null; endDate: string | null }): Promise<{ id: string }>;
  updateNodePeriod(id: string, startDate: string | null, endDate: string | null): Promise<void>;

  listFields(nodeId: string): Promise<StoredField[]>;
  upsertField(nodeId: string, field: StarField, text: string, subject: Subject): Promise<void>;
  countEvidence(nodeId: string, field: StarField): Promise<number>;
  insertEvidence(nodeId: string, field: StarField, evidence: readonly Evidence[]): Promise<void>;

  listOpenSuggestions(nodeId: string): Promise<{ field: StarField; text: string }[]>;
  insertSuggestion(s: { nodeId: string; field: StarField; text: string; subject: Subject; evidence: readonly Evidence[]; conversationKey: string }): Promise<void>;

  listOutputs(nodeId: string): Promise<{ name: string; url: string | null }[]>;
  insertOutput(nodeId: string, name: string, url: string | null): Promise<void>;
}
