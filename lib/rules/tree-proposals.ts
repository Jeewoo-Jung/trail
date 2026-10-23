// Design Ref: PRD 5 should(트리 정리 제안) — Claude가 낸 병합·분리 제안을 앱 규칙에 맞게 걸러서 제안 목록으로 바꾼다.
// 실제 개념 id만 쓰고, 다른 상위 개념끼리는 합치지 않고, 이미 만든(거절한 것 포함) 제안은 다시 만들지 않는다.
import { countChars } from "./card";
import { CONCEPT_LIMITS } from "./limits";
import { normalizeTopic } from "./topic";

export const PROPOSALS_MAX = 3;
export const SPLIT_MIN_CARDS = 4;
export const SPLIT_PARTS_MIN = 2;
export const SPLIT_PARTS_MAX = 3;
export const SPLIT_NAME_MAX_CHARS = 30;

export type ConceptContext = {
  id: string;
  /** 뿌리면 null */
  parentId: string | null;
  name: string;
  /** 뿌리부터 이 개념까지의 이름들 */
  path: string[];
  status: "proposed" | "approved" | "rejected";
  /** 뿌리가 1 */
  depth: number;
  /** 거절되지 않은 자식 수 */
  childCount: number;
  /** 이 개념에 직접 붙은 카드 */
  cards: { id: string; title: string }[];
  /** 거절된 것까지 포함한 자식 이름들(분리할 때 이미 있는 이름과 겹치지 않게 확인하려고) */
  childNames: string[];
};

export type MergePayload = { fromId: string; intoId: string; fromName: string; intoName: string };
export type SplitPayload = { subId: string; subName: string; parts: { name: string; cardIds: string[] }[] };
export type TreeProposal =
  | { kind: "merge"; parentId: string | null; signature: string; payload: MergePayload }
  | { kind: "split"; parentId: string | null; signature: string; payload: SplitPayload };

export const mergeSignature = (a: string, b: string): string => `merge:${[a, b].sort().join("+")}`;
export const splitSignature = (subId: string): string => `split:${subId}`;

/** Claude를 부를 만한 거리가 있는지. 없으면 비용을 쓰지 않는다. */
export function hasProposalCandidates(concepts: readonly ConceptContext[]): boolean {
  const approved = concepts.filter((c) => c.status === "approved");
  const siblings = new Map<string, number>();
  for (const c of approved) {
    const key = c.parentId ?? "";
    siblings.set(key, (siblings.get(key) ?? 0) + 1);
  }
  return [...siblings.values()].some((n) => n >= 2) || approved.some((c) => c.cards.length >= SPLIT_MIN_CARDS && c.depth < CONCEPT_LIMITS.maxDepth);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function parseAdvice(raw: unknown, concepts: readonly ConceptContext[], knownSignatures: ReadonlySet<string>): TreeProposal[] {
  if (typeof raw !== "object" || raw === null) return [];
  const { merges, splits } = raw as { merges?: unknown; splits?: unknown };
  const approved = new Map(concepts.filter((c) => c.status === "approved").map((c) => [c.id, c]));
  const seen = new Set(knownSignatures);
  const out: TreeProposal[] = [];

  for (const item of Array.isArray(merges) ? merges : []) {
    if (typeof item !== "object" || item === null) continue;
    const from = approved.get(str((item as { from?: unknown }).from) ?? "");
    const into = approved.get(str((item as { into?: unknown }).into) ?? "");
    // 같은 부모 아래 형제끼리만, 그리고 합쳐서 없앨 쪽은 자식이 없는 개념이어야 한다.
    if (!from || !into || from.id === into.id || from.parentId !== into.parentId || from.childCount > 0) continue;
    const signature = mergeSignature(from.id, into.id);
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push({ kind: "merge", parentId: from.parentId, signature, payload: { fromId: from.id, intoId: into.id, fromName: from.name, intoName: into.name } });
  }

  for (const item of Array.isArray(splits) ? splits : []) {
    if (typeof item !== "object" || item === null) continue;
    const node = approved.get(str((item as { sub?: unknown }).sub) ?? "");
    const rawParts = (item as { parts?: unknown }).parts;
    if (!node || node.cards.length < SPLIT_MIN_CARDS || node.depth >= CONCEPT_LIMITS.maxDepth || !Array.isArray(rawParts)) continue;
    if (rawParts.length < SPLIT_PARTS_MIN || rawParts.length > SPLIT_PARTS_MAX) continue;
    const signature = splitSignature(node.id);
    if (seen.has(signature)) continue;

    const ownCards = new Set(node.cards.map((c) => c.id));
    // 그 개념 아래에 이미 있는 이름(거절된 것 포함)은 새 이름으로 쓸 수 없다.
    const takenNames = new Set(node.childNames.map(normalizeTopic));
    const usedCards = new Set<string>();
    const partNames = new Set<string>();
    const parts: SplitPayload["parts"] = [];
    let valid = true;
    for (const rawPart of rawParts) {
      const name = str((rawPart as { name?: unknown })?.name);
      const cardsRaw = (rawPart as { cards?: unknown })?.cards;
      if (!name || countChars(name) > SPLIT_NAME_MAX_CHARS || !Array.isArray(cardsRaw) || cardsRaw.length === 0) { valid = false; break; }
      const key = normalizeTopic(name);
      if (takenNames.has(key) || partNames.has(key)) { valid = false; break; }
      partNames.add(key);
      const cardIds: string[] = [];
      for (const id of cardsRaw) {
        if (typeof id !== "string" || !ownCards.has(id) || usedCards.has(id)) { valid = false; break; }
        usedCards.add(id);
        cardIds.push(id);
      }
      if (!valid) break;
      parts.push({ name, cardIds });
    }
    if (!valid) continue;
    seen.add(signature);
    out.push({ kind: "split", parentId: node.parentId, signature, payload: { subId: node.id, subName: node.name, parts } });
  }
  return out.slice(0, PROPOSALS_MAX);
}

export function describeProposal(p: Pick<TreeProposal, "kind" | "payload">): string {
  if (p.kind === "merge") {
    const m = p.payload as MergePayload;
    return `“${m.fromName}”을(를) “${m.intoName}”에 합칩니다. 카드는 “${m.intoName}”으로 옮겨지고 “${m.fromName}”은(는) 사라집니다.`;
  }
  const s = p.payload as SplitPayload;
  return `“${s.subName}” 아래에 ${s.parts.map((x) => `“${x.name}”(${x.cardIds.length}장)`).join(", ")}을(를) 새 하위 개념으로 만들고 카드를 옮깁니다. 나머지 카드는 “${s.subName}”에 그대로 남습니다.`;
}
