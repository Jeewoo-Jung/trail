// 시험용 가짜 저장소: NodeStore 약속을 메모리로 지킨다. 실제 Supabase 저장소와 같은 규칙으로 동작해야 한다.
import { randomUUID } from "node:crypto";
import type { Evidence, StarField, Subject } from "../rules/nodes";
import type { ConversationInfo, NodeStore, StoredField, StoredNode } from "./node-store";

export class FakeNodeStore implements NodeStore {
  conversations = new Map<string, { questionCount: number; topics: Set<string> }>();
  nodes: StoredNode[] = [];
  fields = new Map<string, Map<StarField, { text: string; subject: Subject; locked: boolean; updatedBy: "ai" | "user" }>>();
  evidence = new Map<string, Evidence[]>(); // `${nodeId}|${field}`
  suggestions: { nodeId: string; field: StarField; text: string; subject: Subject; evidence: readonly Evidence[]; conversationKey: string }[] = [];
  outputs = new Map<string, { name: string; url: string | null }[]>();
  tick = 0;
  failOn: string | null = null;

  private boom(where: string) {
    if (this.failOn === where) throw new Error(`저장소 오류(${where}) 비밀 내용이 섞인 메시지`);
  }
  addNode(partial: Partial<StoredNode> & Pick<StoredNode, "kind" | "name">): StoredNode {
    const node: StoredNode = { id: randomUUID(), parentId: null, portfolioStatus: "candidate", deletedAt: null, description: "", startDate: null, endDate: null, lockedFields: [], updatedAt: String(this.tick += 1).padStart(6, "0"), ...partial };
    this.nodes.push(node);
    return node;
  }
  setField(nodeId: string, field: StarField, text: string, locked = false) {
    const m = this.fields.get(nodeId) ?? new Map();
    m.set(field, { text, subject: "did", locked, updatedBy: locked ? "user" : "ai" });
    this.fields.set(nodeId, m);
  }

  async openConversation(key: string | undefined, questionCount: number): Promise<ConversationInfo | null> {
    if (key === undefined) {
      const k = randomUUID();
      this.conversations.set(k, { questionCount, topics: new Set() });
      return { key: k, questionCount };
    }
    const c = this.conversations.get(key);
    if (!c) return null;
    c.questionCount = Math.max(c.questionCount, questionCount);
    return { key, questionCount: c.questionCount };
  }
  async listAskedTopics(conversationKey: string) { return [...(this.conversations.get(conversationKey)?.topics ?? [])]; }
  async markTopicAsked(conversationKey: string, topicKey: string) { this.boom("topic"); this.conversations.get(conversationKey)?.topics.add(topicKey); }

  async listNodes() { this.boom("listNodes"); return this.nodes.map((n) => ({ ...n })); }
  async insertNode(n: { parentId: string | null; kind: StoredNode["kind"]; name: string; description: string; startDate: string | null; endDate: string | null }) {
    this.boom("insertNode");
    return { id: this.addNode({ ...n }).id };
  }
  async updateNodePeriod(id: string, startDate: string | null, endDate: string | null) {
    const n = this.nodes.find((x) => x.id === id);
    if (n) Object.assign(n, { startDate, endDate });
  }

  async listFields(nodeId: string): Promise<StoredField[]> {
    return [...(this.fields.get(nodeId) ?? new Map()).entries()].map(([field, v]) => ({ field, text: v.text, locked: v.locked }));
  }
  async upsertField(nodeId: string, field: StarField, text: string, subject: Subject) {
    this.boom("upsertField");
    const m = this.fields.get(nodeId) ?? new Map();
    m.set(field, { text, subject, locked: m.get(field)?.locked ?? false, updatedBy: "ai" });
    this.fields.set(nodeId, m);
  }
  async countEvidence(nodeId: string, field: StarField) { return (this.evidence.get(`${nodeId}|${field}`) ?? []).length; }
  async insertEvidence(nodeId: string, field: StarField, evidence: readonly Evidence[]) {
    const k = `${nodeId}|${field}`;
    this.evidence.set(k, [...(this.evidence.get(k) ?? []), ...evidence]);
  }
  async listOpenSuggestions(nodeId: string) { return this.suggestions.filter((s) => s.nodeId === nodeId).map((s) => ({ field: s.field, text: s.text })); }
  async insertSuggestion(s: { nodeId: string; field: StarField; text: string; subject: Subject; evidence: readonly Evidence[]; conversationKey: string }) { this.suggestions.push(s); }
  async listOutputs(nodeId: string) { return [...(this.outputs.get(nodeId) ?? [])]; }
  async insertOutput(nodeId: string, name: string, url: string | null) { this.outputs.set(nodeId, [...(this.outputs.get(nodeId) ?? []), { name, url }]); }
}
