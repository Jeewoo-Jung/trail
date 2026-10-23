// Design Ref: PRD 5 should(마인드맵) — 같은 트리 데이터를 점과 선으로 놓는 배치 규칙. 읽기 전용 화면이 이 좌표를 그린다.
// 중심에서 상위 개념이 방사형으로 뻗고, 각 상위 개념에서 하위 개념이 바깥쪽으로 가지를 친다.
import type { TopNode } from "./tree";

/** 접는 기준(PRD: 구현 때 정한다). 하위 개념이 많은 상위 개념, 또는 전체 노드가 많을 때 상위 개념별로 접는다. */
export const FOLD_SUBS_PER_TOP = 8;
export const FOLD_TOTAL_NODES = 40;

export const MAP_SIZE = 1000;
/** 점 반지름. 겹치지 않는지 테스트가 이 값으로 확인한다. */
export const NODE_RADIUS = { root: 52, top: 46, sub: 36 } as const;
const CENTER = MAP_SIZE / 2;
const TOP_RADIUS = 170;
const SUB_RADIUS = 400;
const MAX_STEP = 0.5; // 하위 개념 사이의 최대 각도(라디안)

export type MindNode = {
  /** 트리 화면과 같은 키. 루트는 null(전체) */
  key: string | null;
  label: string;
  count: number;
  kind: "root" | "top" | "sub";
  x: number;
  y: number;
  proposed: boolean;
  /** 접혀서 숨겨진 하위 개념 수 */
  hidden: number;
};
export type MindEdge = { from: string; to: string };
export type MindLayout = { nodes: MindNode[]; edges: MindEdge[] };

/** 상위 개념이 `topCount`개일 때, 하위 점이 겹치지 않고 한 가지에 들어갈 수 있는 최대 개수. */
export function maxSubsThatFit(topCount: number): number {
  const sector = (2 * Math.PI) / Math.max(topCount, 1);
  const arc = sector * 0.9 * SUB_RADIUS; // 하위 점들이 놓이는 호의 길이
  const need = 2 * NODE_RADIUS.sub + 8; // 점 지름 + 여유
  return Math.max(1, Math.floor(arc / need));
}

/** 처음에 접어 둘 상위 개념의 키. 하위가 기준보다 많거나, 겹치지 않고 들어갈 수 없거나, 전체 노드가 너무 많으면 접는다. */
export function defaultCollapsed(tree: readonly TopNode[]): Set<string> {
  const totalNodes = tree.reduce((sum, t) => sum + 1 + (t.id === null ? 0 : t.subs.length), 0);
  const foldAll = totalNodes > FOLD_TOTAL_NODES;
  const limit = Math.min(FOLD_SUBS_PER_TOP, maxSubsThatFit(tree.length));
  return new Set(tree.filter((t) => t.id !== null && (foldAll || t.subs.length > limit)).map((t) => t.key));
}

const round = (n: number) => Math.round(n * 10) / 10;
const point = (radius: number, angle: number) => ({ x: round(CENTER + radius * Math.cos(angle)), y: round(CENTER + radius * Math.sin(angle)) });

export function layoutMindmap(tree: readonly TopNode[], collapsed: ReadonlySet<string>): MindLayout {
  const nodes: MindNode[] = [{ key: null, label: "전체", count: tree.reduce((s, t) => s + t.count, 0), kind: "root", x: CENTER, y: CENTER, proposed: false, hidden: 0 }];
  const edges: MindEdge[] = [];
  const sector = (2 * Math.PI) / Math.max(tree.length, 1);

  tree.forEach((top, i) => {
    const angle = -Math.PI / 2 + i * sector;
    const foldable = top.id !== null;
    const isCollapsed = foldable && collapsed.has(top.key);
    // 미분류처럼 하위가 하나뿐인 노드는 하위 점을 따로 그리지 않고 상위 점에서 카드를 본다.
    const subs = foldable ? top.subs : [];
    nodes.push({ key: top.key, label: top.name, count: top.count, kind: "top", ...point(TOP_RADIUS, angle), proposed: false, hidden: isCollapsed ? subs.length : 0 });
    edges.push({ from: "root", to: top.key });
    if (isCollapsed) return;

    const step = Math.min((sector * 0.9) / Math.max(subs.length, 1), MAX_STEP);
    subs.forEach((sub, j) => {
      const subAngle = angle + (j - (subs.length - 1) / 2) * step;
      nodes.push({ key: sub.key, label: sub.name, count: sub.cards.length, kind: "sub", ...point(SUB_RADIUS, subAngle), proposed: sub.proposed, hidden: 0 });
      edges.push({ from: top.key, to: sub.key });
    });
  });
  return { nodes, edges };
}

export const nodeId = (node: MindNode): string => node.key ?? "root";
