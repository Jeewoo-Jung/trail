// Design Ref: DESIGN.md §3.2 — 카드와 개념 목록으로 화면에 그릴 개념 트리를 만드는 순수 규칙.
// 개념은 부모-자식으로 이어지는 트리다(5단계까지). 카드는 트리의 어느 한 개념에 붙고, 개념마다 "그 아래 모든 카드 수"를 센다.
import { findEstimates } from "./card";
import type { ClassificationCandidate } from "./card";
import type { ConceptRef } from "./classification";

export type ClassificationStatus = "pending" | "done" | "waiting";

export type ConceptRow = ConceptRef & { sortOrder: number };

export type CardRow = {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  evidence: string[];
  candidates: ClassificationCandidate[];
  conceptId: string | null;
  status: ClassificationStatus;
  createdAt: string;
};

export type TreeCard = CardRow & {
  /** 요약에 "(추정)"으로 끝나는 문장이 있다 */
  hasEstimate: boolean;
  /** 근거 발췌가 하나도 없다 */
  noEvidence: boolean;
  /** 뿌리부터 이 카드가 붙은 개념까지의 이름들. 비어 있으면 미분류 */
  path: string[];
  /** 카드가 붙은 개념 아래에 더 세부 개념이 있는데도 이 카드는 거기 직접 붙어 있다("하위 미정") */
  subUndecided: boolean;
};

export type ConceptNode = {
  /** 화면에서 노드를 가리키는 키. 개념은 `c:<id>`, 미분류는 UNCLASSIFIED_KEY */
  key: string;
  id: string | null;
  name: string;
  /** 뿌리부터 이 노드까지의 이름들 */
  path: string[];
  /** 뿌리가 1 */
  depth: number;
  proposed: boolean;
  /** 이 노드와 그 아래 모든 노드에 붙은 카드 수 */
  count: number;
  /** 이 노드에 직접 붙은 카드 */
  ownCards: TreeCard[];
  children: ConceptNode[];
};

export const UNCLASSIFIED_KEY = "unclassified";
export const UNCLASSIFIED_NAME = "미분류";
export const nodeKey = (id: string): string => `c:${id}`;

const byNewest = (a: TreeCard, b: TreeCard) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

/**
 * 트리를 만든다.
 * - 형제는 승인된 것 → 제안 중인 것 순, 그 안에서 정렬 번호·이름 순.
 * - 승인된 개념은 카드가 없어도 보이고(내가 정해 둔 것이므로), 제안 중인 개념은 그 아래에 카드가 하나라도 있을 때만 보인다.
 * - 거절된 개념은 보이지 않는다. 거절된(또는 없어진) 개념에 붙은 카드는 가장 가까운 남은 조상에, 없으면 "미분류"에 둔다.
 * - 개념이 없는 카드(분류 중·대기 포함)는 "미분류" 노드에 모은다.
 */
export function buildTree(cards: readonly CardRow[], concepts: readonly ConceptRow[]): ConceptNode[] {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const childrenOf = new Map<string | null, ConceptRow[]>();
  for (const c of concepts) childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c]);

  /** 카드가 실제로 붙을 개념: 거절된 개념이면 부모로 올라간다. */
  const effective = (id: string | null): string | null => {
    let cur = id;
    const seen = new Set<string>();
    while (cur !== null) {
      const c = byId.get(cur);
      if (!c || seen.has(cur)) return null;
      seen.add(cur);
      if (c.status !== "rejected") return cur;
      cur = c.parentId;
    }
    return null;
  };

  const cardsByConcept = new Map<string | null, CardRow[]>();
  for (const card of cards) {
    const target = effective(card.conceptId);
    cardsByConcept.set(target, [...(cardsByConcept.get(target) ?? []), card]);
  }

  const decorate = (card: CardRow, path: string[]): TreeCard => ({
    ...card,
    hasEstimate: findEstimates(card.summary).length > 0,
    noEvidence: card.evidence.length === 0,
    path,
    subUndecided: false,
  });

  const build = (parentId: string | null, parentPath: string[], depth: number): ConceptNode[] => {
    const nodes: ConceptNode[] = [];
    const siblings = (childrenOf.get(parentId) ?? [])
      .filter((c) => c.status !== "rejected")
      .sort((a, b) => (a.status === b.status ? a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko") : a.status === "approved" ? -1 : 1));
    for (const c of siblings) {
      const path = [...parentPath, c.name];
      const children = build(c.id, path, depth + 1);
      const ownCards = (cardsByConcept.get(c.id) ?? []).map((card) => decorate(card, path)).sort(byNewest);
      const count = ownCards.length + children.reduce((s, k) => s + k.count, 0);
      if (c.status === "proposed" && count === 0) continue;
      if (children.length > 0) for (const card of ownCards) card.subUndecided = true;
      nodes.push({ key: nodeKey(c.id), id: c.id, name: c.name, path, depth, proposed: c.status === "proposed", count, ownCards, children });
    }
    return nodes;
  };

  const roots = build(null, [], 1);
  const unclassified = (cardsByConcept.get(null) ?? []).map((card) => decorate(card, [])).sort(byNewest);
  if (unclassified.length > 0) {
    roots.push({ key: UNCLASSIFIED_KEY, id: null, name: UNCLASSIFIED_NAME, path: [], depth: 1, proposed: false, count: unclassified.length, ownCards: unclassified, children: [] });
  }
  return roots;
}

export function findNode(tree: readonly ConceptNode[], key: string): ConceptNode | null {
  for (const n of tree) {
    if (n.key === key) return n;
    const inner = findNode(n.children, key);
    if (inner) return inner;
  }
  return null;
}

const subtreeCards = (node: ConceptNode): TreeCard[] => [...node.ownCards, ...node.children.flatMap(subtreeCards)];

/** 노드를 눌렀을 때 오른쪽에 보여 줄 카드: 그 노드와 그 아래 모든 카드(최근 것이 먼저). key가 null이면 전체. */
export function cardsOfNode(tree: readonly ConceptNode[], key: string | null): TreeCard[] {
  if (key === null) return tree.flatMap(subtreeCards).sort(byNewest);
  const node = findNode(tree, key);
  return node ? subtreeCards(node).sort(byNewest) : [];
}

/** 트리의 모든 노드를 위에서 아래로(부모가 먼저) 펼친 목록 */
export function flattenNodes(tree: readonly ConceptNode[]): ConceptNode[] {
  return tree.flatMap((n) => [n, ...flattenNodes(n.children)]);
}

export type Proposal = { conceptId: string; name: string; parentPath: string[]; cardCount: number; descendantCount: number };

/**
 * 승인을 기다리는 개념. 제안 중인 가지는 맨 위 노드 하나만 올린다(승인·거절은 가지째 하므로).
 * 부모가 아직 제안 중이면 그 부모를 먼저 승인해야 하므로 따로 올리지 않는다.
 */
export function pendingProposals(tree: readonly ConceptNode[]): Proposal[] {
  const out: Proposal[] = [];
  const countAll = (n: ConceptNode): number => n.children.reduce((s, k) => s + 1 + countAll(k), 0);
  const walk = (n: ConceptNode, parentProposed: boolean) => {
    if (n.proposed && !parentProposed && n.id) {
      out.push({ conceptId: n.id, name: n.name, parentPath: n.path.slice(0, -1), cardCount: n.count, descendantCount: countAll(n) });
    }
    for (const k of n.children) walk(k, parentProposed || n.proposed);
  };
  for (const n of tree) walk(n, false);
  return out;
}

/** 카드의 분류를 한 줄로("취업준비 > 자기소개서"). 없으면 미분류. */
export const classificationLabel = (path: readonly string[]): string => (path.length > 0 ? path.join(" > ") : UNCLASSIFIED_NAME);
