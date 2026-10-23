// Design Ref: DESIGN.md §14.4 — 기록하기 전에 Claude가 먼저 부른다. "기존 활동에 이어붙이기" 후보와 위치 후보,
// 이 대화에서 이미 질문한 주제를 알려 줘서 중복 활동과 같은 주제의 반복 질문을 줄인다. 요약·근거 내용은 돌려주지 않는다.
import { z } from "zod";
import { documentNodeIds, hasStar, STAR_FIELDS, type NodeKind } from "../rules/nodes";
import { chatPendingResults } from "../rules/results";
import type { NodeStore, StoredNode } from "./node-store";

export const listInputSchema = z.object({ conversationKey: z.uuid().optional() });

/** 이어붙이기 후보로 보여 줄 활동 수(최근에 고친 순) */
export const ACTIVITY_CANDIDATES_MAX = 40;
export const PLACE_CANDIDATES_MAX = 40;
/** 결과를 물어볼 수 있는 활동으로 알려 줄 최대 개수 */
export const RESULT_PENDING_MAX = 10;

export type ActivityCandidate = { id: string; kind: NodeKind; path: string; startDate: string | null; endDate: string | null; filledFields: string[]; lockedFields: string[] };
export type PlaceCandidate = { id: string; kind: NodeKind; path: string };
/** 결과(외부 결과·최종 산출물)가 비어 있는 활동. askedBefore가 true이면 이미 물었으니 다시 묻지 않는다(활동당 1회). */
export type ResultPending = { id: string; path: string; askedBefore: boolean };

export type ListOutput = {
  conversationKey: string | null;
  /** 이 대화에서 기록 여부를 이미 물은 횟수(최대 3) */
  questionCount: number;
  /** 이 대화에서 이미 질문한 주제들(주제당 1회) */
  askedTopics: string[];
  /** 이어붙일 수 있는 기존 활동·세부활동 */
  activities: ActivityCandidate[];
  /** 새 활동을 둘 수 있는 위치(범주·프로젝트·활동) */
  places: PlaceCandidate[];
  resultsPending: ResultPending[];
};

export type ListOutcome = { ok: true; output: ListOutput } | { ok: false; errors: string[] };

function pathOf(byId: Map<string, StoredNode>, node: StoredNode): string {
  const names: string[] = [];
  for (let cur: StoredNode | undefined = node, guard = 0; cur && guard < 12; cur = cur.parentId ? byId.get(cur.parentId) : undefined, guard += 1) names.unshift(cur.name);
  return names.join(" > ");
}

export async function listActivities(store: NodeStore, rawInput: unknown, now: Date = new Date()): Promise<ListOutcome> {
  const parsed = listInputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, errors: ["conversationKey 값이 올바르지 않습니다"] };
  const { conversationKey } = parsed.data;

  let questionCount = 0;
  let askedTopics: string[] = [];
  if (conversationKey) {
    const conversation = await store.openConversation(conversationKey, 0);
    if (!conversation) return { ok: false, errors: ["알 수 없는 대화 키입니다. 대화 키 없이 호출하면 처음 기록하는 것으로 봅니다."] };
    questionCount = conversation.questionCount;
    askedTopics = await store.listAskedTopics(conversationKey);
  }

  const nodes = await store.listNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visible = new Set(documentNodeIds(nodes)); // 휴지통·제외 노드는 후보에서 뺀다
  const recent = (a: StoredNode, b: StoredNode) => b.updatedAt.localeCompare(a.updatedAt);

  const activityNodes = nodes.filter((n) => visible.has(n.id) && hasStar(n.kind)).sort(recent).slice(0, ACTIVITY_CANDIDATES_MAX);
  const activities: ActivityCandidate[] = [];
  const fieldsByNode = await store.listFieldsMany(activityNodes.map((n) => n.id));
  for (const n of activityNodes) {
    const fields = fieldsByNode.get(n.id) ?? [];
    activities.push({
      id: n.id,
      kind: n.kind,
      path: pathOf(byId, n),
      startDate: n.startDate,
      endDate: n.endDate,
      filledFields: STAR_FIELDS.filter((f) => fields.some((x) => x.field === f)),
      lockedFields: [...n.lockedFields, ...fields.filter((f) => f.locked).map((f) => f.field)],
    });
  }
  const places: PlaceCandidate[] = nodes
    .filter((n) => visible.has(n.id) && (n.kind === "category" || n.kind === "project" || n.kind === "activity"))
    .sort(recent)
    .slice(0, PLACE_CANDIDATES_MAX)
    .map((n) => ({ id: n.id, kind: n.kind, path: pathOf(byId, n) }));

  const filledIds = await store.listResultFilledNodeIds();
  const resultsPending = chatPendingResults({ nodes: nodes.filter((n) => visible.has(n.id)), filledIds, now })
    .sort((a, b) => Number(a.askedBefore) - Number(b.askedBefore))
    .slice(0, RESULT_PENDING_MAX)
    .map((r) => ({ id: r.nodeId, path: pathOf(byId, byId.get(r.nodeId)!), askedBefore: r.askedBefore }));

  return { ok: true, output: { conversationKey: conversationKey ?? null, questionCount, askedTopics, activities, places, resultsPending } };
}

