// Design Ref: DESIGN.md §14 — 노드·활동 카드의 규칙. 이 파일은 순수 함수만 두고, 저장소(Supabase)는 모른다.
//  - 값 검사(이름·기간·STAR 항목·근거), 노드 종류별 부모 규칙, 이동 검사
//  - 병합 규칙: 잠긴 필드는 건드리지 않고 제안으로, 잠기지 않은 필드는 덧붙이기만 한다
//  - 제외(조상까지 보는 실질 제외)와 문서에 넣을 노드 고르기
import { countChars } from "./text";
import { EVIDENCE_LIMITS, NODE_LIMITS, STAR_LIMITS } from "./limits";

export const NODE_KINDS = ["category", "project", "activity", "subactivity", "study"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export const NODE_KIND_LABEL: Record<NodeKind, string> = { category: "범주", project: "프로젝트", activity: "활동", subactivity: "세부활동", study: "학습" };

export const PORTFOLIO_STATUSES = ["candidate", "needs_work", "hold", "excluded"] as const;
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];
export const PORTFOLIO_LABEL: Record<PortfolioStatus, string> = { candidate: "소재 후보", needs_work: "보완 필요", hold: "보류", excluded: "제외" };

export const SUBJECTS = ["did", "plan", "claude_unconfirmed", "estimate"] as const;
export type Subject = (typeof SUBJECTS)[number];
export const SUBJECT_LABEL: Record<Subject, string> = { did: "내가 한 일", plan: "내 계획", claude_unconfirmed: "Claude 제안·채택 미확인", estimate: "추정" };

export const STAR_FIELDS = ["situation", "task", "action", "result_conversation", "result_external"] as const;
export type StarField = (typeof STAR_FIELDS)[number];
export const STAR_FIELD_LABEL: Record<StarField, string> = { situation: "상황", task: "과제", action: "내가 한 일", result_conversation: "결과(대화에서 얻은 것)", result_external: "외부 결과" };

/** 노드 자체의 잠글 수 있는 필드 */
export const NODE_LOCKABLE = ["name", "kind", "parent", "period", "description", "portfolio_status"] as const;
export type NodeLockable = (typeof NODE_LOCKABLE)[number];

export type NodeRef = { id: string; parentId: string | null; kind: NodeKind; portfolioStatus: PortfolioStatus; deletedAt: string | null };

export type Evidence = { conversationTitle: string; conversationDate: string; excerpt: string };

export type Source = "ai" | "user";

const clean = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// ───────── 노드 값 검사 ─────────

export type NodeInput = { kind: unknown; name: unknown; description?: unknown; startDate?: unknown; endDate?: unknown; portfolioStatus?: unknown };
export type CheckedNodeInput = { kind: NodeKind; name: string; description: string; startDate: string | null; endDate: string | null; portfolioStatus: PortfolioStatus };
export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

export function checkNodeInput(input: NodeInput): Checked<CheckedNodeInput> {
  if (!NODE_KINDS.includes(input.kind as NodeKind)) return { ok: false, message: "노드 종류가 올바르지 않습니다." };
  if (typeof input.name !== "string" || clean(input.name) === "") return { ok: false, message: "이름을 입력해 주세요." };
  const name = clean(input.name);
  if (countChars(name) > NODE_LIMITS.nameMaxChars) return { ok: false, message: `이름은 ${NODE_LIMITS.nameMaxChars}자 이하로 써 주세요.` };
  const description = typeof input.description === "string" ? input.description.normalize("NFC").trim() : "";
  if (countChars(description) > NODE_LIMITS.descriptionMaxChars) return { ok: false, message: `설명은 ${NODE_LIMITS.descriptionMaxChars}자 이하로 써 주세요.` };
  const start = input.startDate ?? null;
  const end = input.endDate ?? null;
  if ((start !== null && !isDate(start)) || (end !== null && !isDate(end))) return { ok: false, message: "날짜는 YYYY-MM-DD 모양이어야 합니다." };
  if (start !== null && end !== null && end < start) return { ok: false, message: "종료일이 시작일보다 앞입니다." };
  const status = input.portfolioStatus ?? "candidate";
  if (!PORTFOLIO_STATUSES.includes(status as PortfolioStatus)) return { ok: false, message: "포트폴리오 상태가 올바르지 않습니다." };
  return { ok: true, value: { kind: input.kind as NodeKind, name, description, startDate: start, endDate: end, portfolioStatus: status as PortfolioStatus } };
}

// ───────── 부모-자식 종류 규칙과 이동 ─────────

const CHILD_KINDS: Record<NodeKind | "root", readonly NodeKind[]> = {
  root: ["category", "project", "activity", "study"],
  category: ["category", "project", "activity", "study"],
  project: ["activity", "study"],
  activity: ["subactivity"],
  subactivity: [],
  study: [],
};

export const canBeChild = (parentKind: NodeKind | null, childKind: NodeKind): boolean => CHILD_KINDS[parentKind ?? "root"].includes(childKind);

/** STAR 항목을 가질 수 있는 노드 종류 */
export const hasStar = (kind: NodeKind): boolean => kind === "activity" || kind === "subactivity";

const byId = (nodes: readonly NodeRef[]) => new Map(nodes.map((n) => [n.id, n]));

export function depthOf(nodes: readonly NodeRef[], id: string | null): number {
  const map = byId(nodes);
  let depth = 0;
  for (let cur = id ? map.get(id) : undefined; cur && depth <= NODE_LIMITS.maxDepth + 1; cur = cur.parentId ? map.get(cur.parentId) : undefined) depth += 1;
  return depth;
}

/** 자기 자신과 모든 자손의 id */
export function subtreeIds(nodes: readonly NodeRef[], id: string): string[] {
  const out = [id];
  for (const n of nodes) if (n.parentId === id) out.push(...subtreeIds(nodes, n.id));
  return out;
}

export const subtreeHeight = (nodes: readonly NodeRef[], id: string): number => 1 + Math.max(0, ...nodes.filter((n) => n.parentId === id).map((n) => subtreeHeight(nodes, n.id)));

/** 새 노드를 parentId 아래에 만들어도 되는지(종류·단계·개수) */
export function checkAddNode(nodes: readonly NodeRef[], parentId: string | null, kind: NodeKind): Checked<null> {
  const parent = parentId === null ? null : byId(nodes).get(parentId);
  if (parentId !== null && (!parent || parent.deletedAt)) return { ok: false, message: "상위 노드를 찾을 수 없습니다." };
  if (!canBeChild(parent?.kind ?? null, kind)) return { ok: false, message: `${NODE_KIND_LABEL[parent?.kind ?? "category"]} 아래에는 ${NODE_KIND_LABEL[kind]}을(를) 만들 수 없습니다.` };
  if (depthOf(nodes, parentId) + 1 > NODE_LIMITS.maxDepth) return { ok: false, message: `노드는 ${NODE_LIMITS.maxDepth}단계까지만 만들 수 있습니다.` };
  if (nodes.length >= NODE_LIMITS.maxTotal) return { ok: false, message: `노드는 ${NODE_LIMITS.maxTotal}개까지만 만들 수 있습니다.` };
  return { ok: true, value: null };
}

/** 노드를 다른 부모 아래로 옮겨도 되는지: 자기 자손 아래로는 못 가고, 종류 규칙·단계 한도를 지켜야 한다 */
export function checkMoveNode(nodes: readonly NodeRef[], id: string, newParentId: string | null): Checked<null> {
  const map = byId(nodes);
  const node = map.get(id);
  if (!node || node.deletedAt) return { ok: false, message: "노드를 찾을 수 없습니다." };
  if (newParentId === node.parentId) return { ok: true, value: null };
  if (newParentId !== null) {
    const parent = map.get(newParentId);
    if (!parent || parent.deletedAt) return { ok: false, message: "옮길 곳을 찾을 수 없습니다." };
    if (subtreeIds(nodes, id).includes(newParentId)) return { ok: false, message: "자기 아래로는 옮길 수 없습니다." };
  }
  const parentKind = newParentId === null ? null : (map.get(newParentId)?.kind ?? null);
  if (!canBeChild(parentKind, node.kind)) return { ok: false, message: `${NODE_KIND_LABEL[parentKind ?? "category"]} 아래에는 ${NODE_KIND_LABEL[node.kind]}을(를) 둘 수 없습니다.` };
  if (depthOf(nodes, newParentId) + subtreeHeight(nodes, id) > NODE_LIMITS.maxDepth) return { ok: false, message: `옮기면 ${NODE_LIMITS.maxDepth}단계를 넘습니다.` };
  return { ok: true, value: null };
}

// ───────── STAR 항목 값 검사 ─────────

export type FieldInput = { field: unknown; text: unknown; subject: unknown; evidence?: readonly Evidence[] };
export type CheckedField = { field: StarField; text: string; subject: Subject; evidence: Evidence[] };

export function checkEvidence(e: Evidence): string | null {
  if (clean(e.conversationTitle) === "" || countChars(clean(e.conversationTitle)) > EVIDENCE_LIMITS.titleMaxChars) return "근거의 대화 제목이 비었거나 너무 깁니다.";
  if (!isDate(e.conversationDate)) return "근거의 대화 날짜가 올바르지 않습니다.";
  if (clean(e.excerpt) === "" || countChars(clean(e.excerpt)) > EVIDENCE_LIMITS.excerptMaxChars) return `근거 발췌는 1~${EVIDENCE_LIMITS.excerptMaxChars}자여야 합니다.`;
  return null;
}

/**
 * STAR 항목 한 개를 검사한다.
 *  - 글자 수는 항목별 한도 이하. 내용이 비면 "비움"으로 본다(저장하지 않거나 지운다).
 *  - AI가 쓰는 내용은 근거가 1개 이상 있어야 하고(없으면 거절), 외부 결과는 AI가 쓸 수 없다. 사용자가 직접 쓰는 내용은 근거 없이도 된다.
 */
export function checkField(input: FieldInput, source: Source): Checked<CheckedField | { field: StarField; empty: true }> {
  if (!STAR_FIELDS.includes(input.field as StarField)) return { ok: false, message: "항목 이름이 올바르지 않습니다." };
  const field = input.field as StarField;
  if (typeof input.text !== "string") return { ok: false, message: "내용이 올바르지 않습니다." };
  const text = input.text.normalize("NFC").trim();
  if (text === "") return { ok: true, value: { field, empty: true } };
  if (countChars(text) > STAR_LIMITS[field]) return { ok: false, message: `${STAR_FIELD_LABEL[field]}은(는) ${STAR_LIMITS[field]}자 이하여야 합니다.` };
  if (!SUBJECTS.includes(input.subject as Subject)) return { ok: false, message: "주체 표시가 올바르지 않습니다." };
  const evidence = [...(input.evidence ?? [])];
  if (evidence.length > EVIDENCE_LIMITS.maxPerField) return { ok: false, message: `근거는 항목당 ${EVIDENCE_LIMITS.maxPerField}개까지입니다.` };
  for (const e of evidence) {
    const problem = checkEvidence(e);
    if (problem) return { ok: false, message: problem };
  }
  if (source === "ai") {
    if (field === "result_external") return { ok: false, message: "외부 결과는 직접 입력한 내용만 저장합니다." };
    if (evidence.length === 0) return { ok: false, message: `${STAR_FIELD_LABEL[field]}에 근거가 없어 비워 둡니다.` };
  }
  return { ok: true, value: { field, text, subject: input.subject as Subject, evidence: evidence.map((e) => ({ conversationTitle: clean(e.conversationTitle), conversationDate: e.conversationDate, excerpt: clean(e.excerpt) })) } };
}

// ───────── 병합 규칙 ─────────

export type StoredField = { text: string; locked: boolean };
export type MergeResult =
  | { action: "set"; text: string } // 비어 있던 곳에 채움
  | { action: "append"; text: string } // 이미 있는 내용 뒤에 덧붙인 결과 전체 글
  | { action: "suggest" } // 값은 두고 제안으로 쌓음(잠김, 또는 덧붙이면 한도를 넘음)
  | { action: "skip" }; // 같은 내용이라 할 일 없음

/** 기록이 기존 활동에 이어붙을 때 한 항목을 어떻게 다룰지 정한다(DESIGN 14.3). 기존 내용은 절대 지우지 않는다. */
export function mergeField(existing: StoredField | null, incomingText: string, field: StarField): MergeResult {
  const incoming = incomingText.trim();
  if (incoming === "") return { action: "skip" };
  if (!existing || existing.text.trim() === "") return existing?.locked ? { action: "suggest" } : { action: "set", text: incoming };
  if (existing.text.includes(incoming)) return { action: "skip" };
  if (existing.locked) return { action: "suggest" };
  const combined = `${existing.text.trimEnd()}\n${incoming}`;
  return countChars(combined) > STAR_LIMITS[field] ? { action: "suggest" } : { action: "append", text: combined };
}

// ───────── 제외와 문서 ─────────

/** 노드 자신이나 조상 중 하나라도 제외이면 실질 제외다(자식만 개별 제외도 가능) */
export function isEffectivelyExcluded(nodes: readonly NodeRef[], id: string): boolean {
  const map = byId(nodes);
  for (let cur = map.get(id), guard = 0; cur && guard <= NODE_LIMITS.maxDepth + 1; cur = cur.parentId ? map.get(cur.parentId) : undefined, guard += 1) {
    if (cur.portfolioStatus === "excluded") return true;
  }
  return false;
}

/** 휴지통에 있거나(자신·조상) 실질 제외인 노드를 뺀, 문서와 내려받기에 넣을 노드 id들 */
export function documentNodeIds(nodes: readonly NodeRef[]): string[] {
  const map = byId(nodes);
  const trashed = (id: string): boolean => {
    for (let cur = map.get(id), guard = 0; cur && guard <= NODE_LIMITS.maxDepth + 1; cur = cur.parentId ? map.get(cur.parentId) : undefined, guard += 1) {
      if (cur.deletedAt) return true;
    }
    return false;
  };
  return nodes.filter((n) => !trashed(n.id) && !isEffectivelyExcluded(nodes, n.id)).map((n) => n.id);
}
