// Design Ref: DESIGN.md §14.5 — 화면이 쓰는 노드 트리. 저장소에서 읽은 줄(노드·항목·근거·산출물·제안)을 한 트리로 묶는다.
// 순수 함수만 두어서 서버·브라우저·시험이 같은 규칙을 쓴다.
import { checkMoveNode, hasStar, isEffectivelyExcluded, NODE_KINDS, canBeChild, type Evidence, type NodeKind, type NodeLockable, type NodeRef, type PortfolioStatus, type StarField, type Subject } from "./nodes";

export type NodeRow = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  portfolioStatus: PortfolioStatus;
  lockedFields: NodeLockable[];
  resultState: "empty" | "snoozed" | "not_applicable" | "filled";
  resultSnoozeUntil: string | null;
  /** Claude가 채팅에서 이 활동의 결과를 이미 물은 시각(활동당 1회) */
  resultAskedAt: string | null;
  sortOrder: number;
  createdBy: "ai" | "user";
  deletedAt: string | null;
  updatedAt: string;
};
export type FieldRow = { nodeId: string; field: StarField; text: string; subject: Subject; locked: boolean; updatedBy: "ai" | "user"; updatedAt: string };
export type EvidenceRow = Evidence & { id: string; nodeId: string; field: StarField };
export type OutputRow = { id: string; nodeId: string; name: string; url: string | null; storagePath: string | null; isFinal: boolean };
export type SuggestionRow = { id: string; nodeId: string; field: StarField; text: string; subject: Subject; evidence: Evidence[]; createdAt: string };

/** 처리를 기다리는 상향식 묶기 제안 */
export type GroupProposalRow = { id: string; childIds: string[]; name: string; kind: "category" | "project"; createdAt: string };

/** 화면에 한 번에 넘기는 전체 데이터 */
export type NodeData = { nodes: NodeRow[]; fields: FieldRow[]; evidence: EvidenceRow[]; outputs: OutputRow[]; suggestions: SuggestionRow[]; proposals: GroupProposalRow[] };
export const EMPTY_DATA: NodeData = { nodes: [], fields: [], evidence: [], outputs: [], suggestions: [], proposals: [] };

export type TreeNode = NodeRow & {
  children: TreeNode[];
  depth: number;
  path: string[];
  /** 자신이나 조상이 제외 상태 */
  effectiveExcluded: boolean;
  /** 자신 아래(포함)의 처리 대기 중인 필드 제안 수 */
  pendingSuggestions: number;
};

const byOrder = (a: NodeRow, b: NodeRow) => a.sortOrder - b.sortOrder || (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || a.name.localeCompare(b.name, "ko");

const toRef = (n: NodeRow): NodeRef => ({ id: n.id, parentId: n.parentId, kind: n.kind, portfolioStatus: n.portfolioStatus, deletedAt: n.deletedAt });
export const refsOf = (nodes: readonly NodeRow[]): NodeRef[] => nodes.map(toRef);

/** 휴지통에 있는 가지의 맨 위 노드들: 부모가 없거나, 부모가 휴지통에 없거나, 부모와 다른 시각에 들어간 노드 */
export function trashedRoots(nodes: readonly NodeRow[]): NodeRow[] {
  const map = new Map(nodes.map((n) => [n.id, n]));
  return nodes
    .filter((n) => {
      if (!n.deletedAt) return false;
      const parent = n.parentId ? map.get(n.parentId) : undefined;
      return !parent || parent.deletedAt !== n.deletedAt;
    })
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
}

export type NodeTree = { roots: TreeNode[]; byId: Map<string, TreeNode> };

export function buildNodeTree(data: NodeData): NodeTree {
  const active = data.nodes.filter((n) => !n.deletedAt);
  const refs = refsOf(active);
  const pending = new Map<string, number>();
  for (const s of data.suggestions) pending.set(s.nodeId, (pending.get(s.nodeId) ?? 0) + 1);
  const byId = new Map<string, TreeNode>();
  for (const n of active) byId.set(n.id, { ...n, children: [], depth: 1, path: [n.name], effectiveExcluded: isEffectivelyExcluded(refs, n.id), pendingSuggestions: pending.get(n.id) ?? 0 });
  const roots: TreeNode[] = [];
  for (const n of [...active].sort(byOrder)) {
    const node = byId.get(n.id)!;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const finish = (node: TreeNode, depth: number, path: string[]): number => {
    node.depth = depth;
    node.path = [...path, node.name];
    for (const c of node.children) node.pendingSuggestions += finish(c, depth + 1, node.path);
    return node.pendingSuggestions;
  };
  for (const r of roots) finish(r, 1, []);
  return { roots, byId };
}

export function flatten(roots: readonly TreeNode[]): TreeNode[] {
  return roots.flatMap((n) => [n, ...flatten(n.children)]);
}

/** 노드를 옮길 수 있는 곳: 맨 위(null)와, 종류·단계 규칙을 지키는 노드들. 라벨은 경로다. */
export function moveTargets(tree: NodeTree, nodes: readonly NodeRow[], id: string): { id: string | null; label: string }[] {
  const refs = refsOf(nodes.filter((n) => !n.deletedAt));
  const out: { id: string | null; label: string }[] = [];
  if (checkMoveNode(refs, id, null).ok) out.push({ id: null, label: "맨 위" });
  for (const n of flatten(tree.roots)) {
    if (n.id !== id && checkMoveNode(refs, id, n.id).ok) out.push({ id: n.id, label: n.path.join(" › ") });
  }
  return out;
}

/** 이 노드 아래에 새로 만들 수 있는 종류들(null이면 맨 위) */
export const childKindsFor = (parentKind: NodeKind | null): NodeKind[] => NODE_KINDS.filter((k) => canBeChild(parentKind, k));

/** 이 노드로 바꿀 수 있는 종류: 부모 아래에 둘 수 있고, 지금 자식들을 모두 품을 수 있어야 하며, 항목이 있으면 항목을 가질 수 있어야 한다 */
export function kindChoices(node: TreeNode, parent: TreeNode | undefined, hasFields: boolean): NodeKind[] {
  return NODE_KINDS.filter((k) => canBeChild(parent?.kind ?? null, k) && node.children.every((c) => canBeChild(k, c.kind)) && (!hasFields || hasStar(k)));
}

/** 합칠 수 있는 짝: 같은 종류의 다른 활동(조상·자손 관계가 아닌 것) */
export function mergeCandidates(tree: NodeTree, node: TreeNode): { id: string; label: string }[] {
  if (!hasStar(node.kind)) return [];
  const related = new Set<string>();
  const mark = (n: TreeNode) => { related.add(n.id); n.children.forEach(mark); };
  mark(node);
  for (let cur = node.parentId ? tree.byId.get(node.parentId) : undefined; cur; cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined) related.add(cur.id);
  return flatten(tree.roots).filter((n) => n.kind === node.kind && !related.has(n.id)).map((n) => ({ id: n.id, label: n.path.join(" › ") }));
}
