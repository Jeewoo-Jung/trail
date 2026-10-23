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
  resultState: "empty" | "snoozed" | "not_applicable" | "filled";
  resultSnoozeUntil: string | null;
  resultAskedAt: string | null;
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
  insertOutput(nodeId: string, name: string, url: string | null, isFinal?: boolean): Promise<void>;

  /** 결과가 채워진 활동 id들(외부 결과 글이 있거나 최종 산출물이 있는 활동) */
  listResultFilledNodeIds(): Promise<Set<string>>;
  /** 사용자가 말한 외부 결과를 그 항목에 쓴다(내가 입력한 것이라 잠긴다) */
  setResultText(nodeId: string, text: string): Promise<void>;
  /** Claude가 이 활동의 결과를 채팅에서 물었다고 기록한다(활동당 1회) */
  markResultAsked(nodeId: string): Promise<void>;
  setResultState(nodeId: string, state: "empty" | "not_applicable" | "filled"): Promise<void>;
}
