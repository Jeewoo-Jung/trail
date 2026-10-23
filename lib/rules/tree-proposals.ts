// Design Ref: PRD 5 should(트리 정리 제안) — Claude가 낸 병합·분리 제안을 앱 규칙에 맞게 걸러서 제안 목록으로 바꾼다.
// 실제 개념 id만 쓰고, 다른 상위 개념끼리는 합치지 않고, 이미 만든(거절한 것 포함) 제안은 다시 만들지 않는다.
import { countChars } from "./card";
import { normalizeTopic } from "./topic";

export const PROPOSALS_MAX = 3;
export const SPLIT_MIN_CARDS = 4;
export const SPLIT_PARTS_MIN = 2;
export const SPLIT_PARTS_MAX = 3;
export const SPLIT_NAME_MAX_CHARS = 30;

export type SubContext = {
  id: string;
  topId: string;
  topName: string;
  name: string;
  status: "proposed" | "approved" | "rejected";
  cards: { id: string; title: string }[];
};

export type MergePayload = { fromId: string; intoId: string; fromName: string; intoName: string };
export type SplitPayload = { subId: string; subName: string; parts: { name: string; cardIds: string[] }[] };
export type TreeProposal =
  | { kind: "merge"; topId: string; signature: string; payload: MergePayload }
  | { kind: "split"; topId: string; signature: string; payload: SplitPayload };

export const mergeSignature = (a: string, b: string): string => `merge:${[a, b].sort().join("+")}`;
export const splitSignature = (subId: string): string => `split:${subId}`;

/** Claude를 부를 만한 거리가 있는지. 없으면 비용을 쓰지 않는다. */
export function hasProposalCandidates(subs: readonly SubContext[]): boolean {
  const approved = subs.filter((s) => s.status === "approved");
  const perTop = new Map<string, number>();
  for (const s of approved) perTop.set(s.topId, (perTop.get(s.topId) ?? 0) + 1);
  return [...perTop.values()].some((n) => n >= 2) || approved.some((s) => s.cards.length >= SPLIT_MIN_CARDS);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function parseAdvice(raw: unknown, subs: readonly SubContext[], knownSignatures: ReadonlySet<string>): TreeProposal[] {
  if (typeof raw !== "object" || raw === null) return [];
  const { merges, splits } = raw as { merges?: unknown; splits?: unknown };
  const approved = new Map(subs.filter((s) => s.status === "approved").map((s) => [s.id, s]));
  const seen = new Set(knownSignatures);
  const out: TreeProposal[] = [];

  for (const item of Array.isArray(merges) ? merges : []) {
    if (typeof item !== "object" || item === null) continue;
    const from = approved.get(str((item as { from?: unknown }).from) ?? "");
    const into = approved.get(str((item as { into?: unknown }).into) ?? "");
    if (!from || !into || from.id === into.id || from.topId !== into.topId) continue;
    const signature = mergeSignature(from.id, into.id);
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push({ kind: "merge", topId: from.topId, signature, payload: { fromId: from.id, intoId: into.id, fromName: from.name, intoName: into.name } });
  }

  for (const item of Array.isArray(splits) ? splits : []) {
    if (typeof item !== "object" || item === null) continue;
    const sub = approved.get(str((item as { sub?: unknown }).sub) ?? "");
    const rawParts = (item as { parts?: unknown }).parts;
    if (!sub || sub.cards.length < SPLIT_MIN_CARDS || !Array.isArray(rawParts)) continue;
    if (rawParts.length < SPLIT_PARTS_MIN || rawParts.length > SPLIT_PARTS_MAX) continue;
    const signature = splitSignature(sub.id);
    if (seen.has(signature)) continue;

    const ownCards = new Set(sub.cards.map((c) => c.id));
    // 같은 상위 개념 아래 이미 있는 이름(거절된 것 포함)과 원래 이름은 새 이름으로 쓸 수 없다.
    const takenNames = new Set(subs.filter((s) => s.topId === sub.topId).map((s) => normalizeTopic(s.name)));
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
    out.push({ kind: "split", topId: sub.topId, signature, payload: { subId: sub.id, subName: sub.name, parts } });
  }
  return out.slice(0, PROPOSALS_MAX);
}

export function describeProposal(p: Pick<TreeProposal, "kind" | "payload">): string {
  if (p.kind === "merge") {
    const m = p.payload as MergePayload;
    return `“${m.fromName}”을(를) “${m.intoName}”에 합칩니다. 카드는 “${m.intoName}”으로 옮겨지고 “${m.fromName}”은(는) 사라집니다.`;
  }
  const s = p.payload as SplitPayload;
  return `“${s.subName}”에서 ${s.parts.map((x) => `“${x.name}”(${x.cardIds.length}장)`).join(", ")}을(를) 새 하위 개념으로 나눕니다. 나머지 카드는 그대로 남습니다.`;
}
