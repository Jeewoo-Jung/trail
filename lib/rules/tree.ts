// Design Ref: DESIGN.md §3.2 — 카드와 개념 목록으로 화면에 그릴 개념 트리를 만드는 순수 규칙.
import { findEstimates } from "./card";
import type { ClassificationCandidate } from "./card";

export type ClassificationStatus = "pending" | "done" | "waiting";

export type CardRow = {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  evidence: string[];
  candidates: ClassificationCandidate[];
  topId: string | null;
  subId: string | null;
  status: ClassificationStatus;
  createdAt: string;
};
export type TopRow = { id: string; name: string; sortOrder: number };
export type SubRow = { id: string; topId: string; name: string; status: "proposed" | "approved" | "rejected" };

export type TreeCard = CardRow & {
  /** 요약에 "(추정)"으로 끝나는 문장이 있다 */
  hasEstimate: boolean;
  /** 근거 발췌가 하나도 없다 */
  noEvidence: boolean;
  /** 거절된 하위 개념 때문에 하위 개념이 비어 있다("하위 미정") */
  subUndecided: boolean;
  topName: string | null;
  subName: string | null;
};

export type SubNode = { key: string; id: string | null; name: string; proposed: boolean; undecided: boolean; cards: TreeCard[] };
export type TopNode = { key: string; id: string | null; name: string; count: number; subs: SubNode[] };

export const UNCLASSIFIED_KEY = "unclassified";
export const UNCLASSIFIED_NAME = "미분류";
export const UNDECIDED_SUB_NAME = "하위 미정";

const byNewest = (a: TreeCard, b: TreeCard) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

/**
 * 트리를 만든다.
 * - 상위 개념은 정렬 번호·이름 순, 그 아래 하위 개념은 승인된 것 → 제안 중인 것 순.
 * - 카드가 없는 상위 개념도 보여 준다(내가 정해 둔 목록이므로). 카드가 없는 하위 개념은 승인된 것만 보여 준다.
 * - 거절된 하위 개념의 카드와 하위 개념이 비어 있는 카드는 "하위 미정" 아래에 둔다.
 * - 상위 개념이 없는 카드(분류 중·대기 포함)는 "미분류"에 둔다.
 */
export function buildTree(cards: readonly CardRow[], tops: readonly TopRow[], subs: readonly SubRow[]): TopNode[] {
  const topById = new Map(tops.map((t) => [t.id, t]));
  const subById = new Map(subs.map((s) => [s.id, s]));

  const decorated: TreeCard[] = cards.map((card) => {
    const top = card.topId ? (topById.get(card.topId) ?? null) : null;
    const sub = card.subId ? (subById.get(card.subId) ?? null) : null;
    const usableSub = top && sub && sub.topId === top.id && sub.status !== "rejected" ? sub : null;
    return {
      ...card,
      hasEstimate: findEstimates(card.summary).length > 0,
      noEvidence: card.evidence.length === 0,
      subUndecided: Boolean(top && card.status === "done" && !usableSub),
      topName: top?.name ?? null,
      subName: usableSub?.name ?? null,
    };
  });

  const sortedTops = [...tops].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko"));
  const result: TopNode[] = sortedTops.map((top) => {
    const topCards = decorated.filter((c) => c.topId === top.id).sort(byNewest);
    const topSubs = subs
      .filter((s) => s.topId === top.id && s.status !== "rejected")
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, "ko") : a.status === "approved" ? -1 : 1));

    const subNodes: SubNode[] = [];
    for (const sub of topSubs) {
      const subCards = topCards.filter((c) => c.subName === sub.name && c.subId === sub.id);
      if (sub.status === "proposed" && subCards.length === 0) continue;
      subNodes.push({ key: `sub:${sub.id}`, id: sub.id, name: sub.name, proposed: sub.status === "proposed", undecided: false, cards: subCards });
    }
    const undecided = topCards.filter((c) => c.subName === null);
    if (undecided.length > 0) {
      subNodes.push({ key: `undecided:${top.id}`, id: null, name: UNDECIDED_SUB_NAME, proposed: false, undecided: true, cards: undecided });
    }
    return { key: `top:${top.id}`, id: top.id, name: top.name, count: topCards.length, subs: subNodes };
  });

  const unclassified = decorated.filter((c) => c.topName === null).sort(byNewest);
  if (unclassified.length > 0) {
    result.push({
      key: UNCLASSIFIED_KEY,
      id: null,
      name: UNCLASSIFIED_NAME,
      count: unclassified.length,
      subs: [{ key: "unclassified:all", id: null, name: UNCLASSIFIED_NAME, proposed: false, undecided: false, cards: unclassified }],
    });
  }
  return result;
}

/** 어느 노드를 눌렀을 때 오른쪽에 보여 줄 카드. 상위 개념을 누르면 그 아래 모든 카드. */
export function cardsOfNode(tops: readonly TopNode[], key: string | null): TreeCard[] {
  if (key === null) return tops.flatMap((t) => t.subs.flatMap((s) => s.cards)).sort(byNewest);
  for (const top of tops) {
    if (top.key === key) return top.subs.flatMap((s) => s.cards).sort(byNewest);
    const sub = top.subs.find((s) => s.key === key);
    if (sub) return sub.cards;
  }
  return [];
}

export type Proposal = { subId: string; topName: string; name: string; cardCount: number };

/** 승인을 기다리는 하위 개념(제안)을 모은다. 위에서부터 트리 순서를 따른다. */
export function pendingProposals(tree: readonly TopNode[]): Proposal[] {
  return tree.flatMap((top) =>
    top.subs.flatMap((sub) => (sub.proposed && sub.id ? [{ subId: sub.id, topName: top.name, name: sub.name, cardCount: sub.cards.length }] : [])),
  );
}
