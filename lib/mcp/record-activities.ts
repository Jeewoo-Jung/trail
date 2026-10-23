// Design Ref: DESIGN.md §14.3·§14.4 — Claude가 보낸 활동 기록을 검사해서 노드·활동 카드에 저장·병합한다.
//   모양·한도 검사 → 비밀값 가리기 → 새 활동 만들기 또는 기존 활동 찾기 → 항목별 병합(잠긴 항목은 제안으로)
// 결과에는 id·상태·항목별 처리 결과만 담고 내용은 돌려주지 않는다. 일부 항목이 거절돼도 나머지는 저장된다.
import { z } from "zod";
import { countChars } from "../rules/text";
import { NODE_LIMITS } from "../rules/limits";
import { maskSecrets } from "../rules/mask-secrets";
import { checkAddNode, checkField, checkNodeInput, hasStar, isEffectivelyExcluded, mergeField, STAR_FIELD_LABEL, SUBJECTS, type Evidence, type NodeKind, type StarField } from "../rules/nodes";
import { normalizeTopic } from "../rules/topic";
import type { NodeStore, StoredNode } from "./node-store";

/** 한 번에 보낼 수 있는 활동 수 */
export const ACTIVITIES_PER_CALL_MAX = 5;
/** AI가 채울 수 있는 항목(외부 결과는 사용자가 직접 입력한다) */
const AI_FIELDS = ["situation", "task", "action", "result_conversation"] as const;

const evidenceSchema = z.object({ conversationTitle: z.string(), conversationDate: z.string(), excerpt: z.string() });
const fieldSchema = z.object({ text: z.string(), subject: z.enum(SUBJECTS), evidence: z.array(evidenceSchema).optional() });

export const recordInputSchema = z.object({
  conversationKey: z.uuid().optional(),
  /** 이번 대화에서 기록 여부를 물은 횟수(대화당 최대 3회) */
  questionCount: z.number().int().min(0).max(3).optional(),
  /** 방금 질문한 주제(주제당 1회 질문을 기록한다) */
  topicKey: z.string().optional(),
  activities: z.array(z.unknown()).max(ACTIVITIES_PER_CALL_MAX),
});

const activitySchema = z.object({
  /** 기존 활동에 이어붙일 때 */
  nodeId: z.uuid().optional(),
  /** 새 활동일 때 */
  name: z.string().optional(),
  kind: z.enum(["activity", "subactivity", "study"]).optional(),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  /** 새 활동의 위치: 기존 노드 id, 또는 프로젝트 이름(같은 이름의 프로젝트가 없으면 새로 만든다). 둘 다 없으면 맨 위에 둔다. */
  parentId: z.uuid().optional(),
  projectName: z.string().optional(),
  fields: z.object({ situation: fieldSchema.optional(), task: fieldSchema.optional(), action: fieldSchema.optional(), result_conversation: fieldSchema.optional() }).optional(),
  outputs: z.array(z.object({ name: z.string(), url: z.string().optional() })).max(5).optional(),
});

export type FieldOutcome = "set" | "appended" | "suggested" | "skipped" | "dropped";
export type ActivityResult = {
  status: "created" | "updated" | "rejected";
  nodeId?: string;
  name?: string;
  fields?: Partial<Record<StarField, FieldOutcome>>;
  outputsAdded?: number;
  notes?: string[];
  reasons?: string[];
};
export type RecordOutput = { conversationKey: string; results: ActivityResult[] };
export type RecordOutcome = { ok: true; output: RecordOutput } | { ok: false; errors: string[] };

const EXCLUDED_REASON = "제외된 노드라서 기록하지 않았습니다. 사용자가 제외를 풀기 전에는 이어붙이거나 그 아래에 새로 만들지 않습니다.";
const SAVE_FAILED = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const mask = (text: string) => maskSecrets(text).text;
const maskEvidence = (e: Evidence): Evidence => ({ conversationTitle: mask(e.conversationTitle), conversationDate: e.conversationDate, excerpt: mask(e.excerpt) });
const isHttp = (url: string) => /^https?:\/\/\S+$/i.test(url);

/** 활동 묶음을 처리한다. 활동마다 결과가 따로 나오므로 일부가 거절돼도 나머지는 저장된다. */
export async function recordActivities(store: NodeStore, rawInput: unknown): Promise<RecordOutcome> {
  const parsed = recordInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => (issue.path.length > 0 ? issue.path.map(String).join(".") : "입력"));
    return { ok: false, errors: [...new Set(fields)].map((field) => `${field} 값이 없거나 형식이 올바르지 않습니다`) };
  }
  const input = parsed.data;

  const conversation = await store.openConversation(input.conversationKey, input.questionCount ?? 0);
  if (!conversation) return { ok: false, errors: ["알 수 없는 대화 키입니다. 대화 키 없이 다시 보내면 새로 발급합니다."] };

  const results: ActivityResult[] = [];
  let saved = false;
  for (const raw of input.activities) {
    const checked = activitySchema.safeParse(raw);
    if (!checked.success) {
      results.push({ status: "rejected", reasons: [...new Set(checked.error.issues.map((i) => `${i.path.map(String).join(".") || "활동"} 형식이 올바르지 않습니다`))] });
      continue;
    }
    try {
      const result = await recordOne(store, conversation.key, checked.data);
      if (result.status !== "rejected") saved = true;
      results.push(result);
    } catch {
      // 저장소 오류에는 내용이 섞여 있을 수 있어서 이유는 일반 문구만 돌려준다.
      results.push({ status: "rejected", reasons: [SAVE_FAILED] });
    }
  }

  // 질문한 주제는 기록이 하나라도 저장됐을 때 남긴다(저장이 안 됐으면 같은 주제로 다시 물을 수 있게 둔다).
  if (input.topicKey && saved && input.topicKey.trim() !== "") {
    try {
      await store.markTopicAsked(conversation.key, input.topicKey.trim().slice(0, 100));
    } catch {
      /* 질문 기록 실패는 기록 자체를 막지 않는다 */
    }
  }
  return { ok: true, output: { conversationKey: conversation.key, results } };
}

type ActivityInput = z.infer<typeof activitySchema>;

async function recordOne(store: NodeStore, conversationKey: string, input: ActivityInput): Promise<ActivityResult> {
  const nodes = await store.listNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const notes: string[] = [];
  let node: StoredNode | undefined;
  let created = false;

  if (input.nodeId) {
    node = byId.get(input.nodeId);
    if (!node || node.deletedAt) return { status: "rejected", reasons: ["활동 id를 찾지 못했습니다. id 없이 새 활동으로 보내 주세요."] };
    if (!hasStar(node.kind)) return { status: "rejected", reasons: ["활동이나 세부활동에만 내용을 이어붙일 수 있습니다."] };
    if (isEffectivelyExcluded(nodes, node.id)) return { status: "rejected", reasons: [EXCLUDED_REASON] };
  } else {
    const made = await createActivity(store, nodes, input);
    if (!made.ok) return { status: "rejected", reasons: [made.message] };
    node = made.node;
    created = true;
    notes.push(...made.notes);
  }

  // 기존 활동의 기간은 잠기지 않았을 때만 넓힌다(시작은 비어 있을 때 채우고, 끝은 더 늦을 때 늘린다).
  if (!created && !node.lockedFields.includes("period")) {
    const start = node.startDate ?? (input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : null);
    const end = input.endDate && /^\d{4}-\d{2}-\d{2}$/.test(input.endDate) && (!node.endDate || input.endDate > node.endDate) ? input.endDate : node.endDate;
    if (start !== node.startDate || end !== node.endDate) {
      if (start && end && end < start) notes.push("기간이 맞지 않아 그대로 둡니다.");
      else await store.updateNodePeriod(node.id, start, end);
    }
  }

  const outcomes: Partial<Record<StarField, FieldOutcome>> = {};
  const existing = new Map((created ? [] : await store.listFields(node.id)).map((f) => [f.field, f]));
  const openSuggestions = created ? [] : await store.listOpenSuggestions(node.id);

  for (const field of AI_FIELDS) {
    const given = input.fields?.[field];
    if (!given) continue;
    const text = mask(given.text);
    const evidence = (given.evidence ?? []).map(maskEvidence);
    const checked = checkField({ field, text, subject: given.subject, evidence }, "ai");
    if (!checked.ok) {
      outcomes[field] = "dropped";
      notes.push(`${STAR_FIELD_LABEL[field]}: ${checked.message}`);
      continue;
    }
    if ("empty" in checked.value) continue;
    const value = checked.value;
    const stored = existing.get(field) ?? null;
    const merged = mergeField(stored ? { text: stored.text, locked: stored.locked } : null, value.text, field);
    if (merged.action === "skip") {
      outcomes[field] = "skipped";
    } else if (merged.action === "suggest") {
      if (openSuggestions.some((s) => s.field === field && s.text === value.text)) {
        outcomes[field] = "skipped";
      } else {
        await store.insertSuggestion({ nodeId: node.id, field, text: value.text, subject: value.subject, evidence: value.evidence, conversationKey });
        outcomes[field] = "suggested";
      }
    } else {
      await store.upsertField(node.id, field, merged.text, value.subject);
      const room = Math.max(0, 3 - (await store.countEvidence(node.id, field)));
      if (room > 0) await store.insertEvidence(node.id, field, value.evidence.slice(0, room));
      outcomes[field] = merged.action === "set" ? "set" : "appended";
    }
  }

  let outputsAdded = 0;
  if (input.outputs?.length) {
    const known = await store.listOutputs(node.id);
    let count = known.length;
    for (const o of input.outputs) {
      const name = mask(o.name).trim();
      const url = o.url ? mask(o.url).trim() : null;
      if (name === "" || countChars(name) > NODE_LIMITS.outputNameMaxChars) { notes.push("산출물 이름이 비었거나 너무 길어 건너뜁니다."); continue; }
      if (url !== null && (!isHttp(url) || countChars(url) > NODE_LIMITS.urlMaxChars)) { notes.push("산출물 링크 모양이 올바르지 않아 건너뜁니다."); continue; }
      if (known.some((k) => k.name === name && k.url === url)) continue;
      if (count >= NODE_LIMITS.outputsMaxCount) { notes.push(`산출물은 활동당 ${NODE_LIMITS.outputsMaxCount}개까지입니다.`); break; }
      await store.insertOutput(node.id, name, url);
      known.push({ name, url });
      count += 1;
      outputsAdded += 1;
    }
  }

  return { status: created ? "created" : "updated", nodeId: node.id, name: node.name, fields: outcomes, ...(outputsAdded > 0 ? { outputsAdded } : {}), ...(notes.length > 0 ? { notes } : {}) };
}

type Made = { ok: true; node: StoredNode; notes: string[] } | { ok: false; message: string };

/** 새 활동을 만든다. 위치는 parentId, 없으면 projectName(같은 이름의 프로젝트를 쓰거나 새로 만든다), 둘 다 없으면 맨 위. */
async function createActivity(store: NodeStore, nodes: StoredNode[], input: ActivityInput): Promise<Made> {
  const kind: NodeKind = input.kind ?? "activity";
  const checked = checkNodeInput({ kind, name: input.name === undefined ? undefined : mask(input.name), description: input.description === undefined ? "" : mask(input.description), startDate: input.startDate ?? null, endDate: input.endDate ?? null });
  if (!checked.ok) return { ok: false, message: checked.message };
  const notes: string[] = [];

  let parentId: string | null = input.parentId ?? null;
  if (parentId === null && input.projectName && input.projectName.trim() !== "") {
    const projectName = mask(input.projectName);
    const same = nodes.find((n) => n.kind === "project" && !n.deletedAt && n.parentId === null && normalizeTopic(n.name) === normalizeTopic(projectName));
    if (same) {
      parentId = same.id;
    } else {
      const project = checkNodeInput({ kind: "project", name: projectName });
      if (!project.ok) return { ok: false, message: `프로젝트 이름: ${project.message}` };
      const room = checkAddNode(nodes, null, "project");
      if (!room.ok) return { ok: false, message: room.message };
      const made = await store.insertNode({ parentId: null, kind: "project", name: project.value.name, description: "", startDate: null, endDate: null });
      nodes.push({ id: made.id, parentId: null, kind: "project", portfolioStatus: "candidate", deletedAt: null, name: project.value.name, description: "", startDate: null, endDate: null, lockedFields: [], updatedAt: "" });
      parentId = made.id;
      notes.push("프로젝트를 새로 만들었습니다.");
    }
  }
  if (parentId !== null && isEffectivelyExcluded(nodes, parentId)) return { ok: false, message: EXCLUDED_REASON };
  const placed = checkAddNode(nodes, parentId, kind);
  if (!placed.ok) return { ok: false, message: placed.message };
  const v = checked.value;
  const { id } = await store.insertNode({ parentId, kind, name: v.name, description: v.description, startDate: v.startDate, endDate: v.endDate });
  return { ok: true, notes, node: { id, parentId, kind, portfolioStatus: "candidate", deletedAt: null, name: v.name, description: v.description, startDate: v.startDate, endDate: v.endDate, lockedFields: [], updatedAt: "" } };
}
