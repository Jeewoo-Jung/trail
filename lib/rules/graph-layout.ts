// Design Ref: DESIGN.md §12 — 옵시디언 그래프 보기처럼 점들이 서로 밀어내고 선이 당기는 힘으로 자리를 잡는 배치.
// 화면(components/mindmap.tsx)이 이 계산을 매 프레임 돌리고, 계산 자체는 화면과 무관하게 시험할 수 있도록 여기에 둔다.
import { FOLD_SUBS_PER_TOP, FOLD_TOTAL_NODES } from "./mindmap";
import type { TopNode } from "./tree";

export type GraphNode = {
  id: string;
  /** 트리 화면과 같은 키 */
  key: string;
  label: string;
  kind: "top" | "sub";
  /** 상위 개념의 순번. 같은 상위 개념에 속한 점은 같은 색으로 보인다 */
  group: number;
  count: number;
  proposed: boolean;
  /** 접혀서 숨겨진 하위 개념 수 */
  hidden: number;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
};
export type GraphEdge = { source: string; target: string };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const NODE_MIN_R = { top: 9, sub: 5 } as const;

/** 카드가 많을수록 점이 조금 커진다(옵시디언은 연결이 많을수록 커진다). */
export function nodeRadius(kind: "top" | "sub", count: number): number {
  const base = NODE_MIN_R[kind];
  return Math.round((base + Math.min(Math.sqrt(count) * (kind === "top" ? 2.2 : 2.6), kind === "top" ? 14 : 10)) * 10) / 10;
}

const LINK_DISTANCE = 95;
const REPULSION = 2600;
const GRAVITY = 0.012;
const DAMPING = 0.82;
const COLLIDE_PADDING = 6;

/** 같은 입력이면 같은 숫자를 돌려주는 작은 어긋남(점이 정확히 겹쳐 시작하는 것을 피한다). */
function wobble(index: number): number {
  const x = Math.sin(index * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/** 처음에 접어 둘 상위 개념(마인드맵 규칙과 같다). */
export function defaultCollapsedGraph(tree: readonly TopNode[]): Set<string> {
  const total = tree.reduce((sum, t) => sum + 1 + (t.id === null ? 0 : t.subs.length), 0);
  const foldAll = total > FOLD_TOTAL_NODES;
  return new Set(tree.filter((t) => t.id !== null && (foldAll || t.subs.length > FOLD_SUBS_PER_TOP)).map((t) => t.key));
}

/** 트리에서 점과 선을 만든다. previous가 있으면 같은 점은 있던 자리에서 이어 간다. */
export function buildGraph(tree: readonly TopNode[], collapsed: ReadonlySet<string>, previous?: ReadonlyMap<string, { x: number; y: number }>): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const ring = Math.max(1, tree.length);

  tree.forEach((top, g) => {
    const angle = -Math.PI / 2 + (g * 2 * Math.PI) / ring;
    const hub = { x: Math.cos(angle) * 170, y: Math.sin(angle) * 170 };
    const foldable = top.id !== null;
    const subs = foldable ? top.subs : [];
    const isCollapsed = foldable && collapsed.has(top.key);
    const prevTop = previous?.get(top.key);
    nodes.push({
      id: top.key, key: top.key, label: top.name, kind: "top", group: g, count: top.count, proposed: false,
      hidden: isCollapsed ? subs.length : 0, r: nodeRadius("top", top.count),
      x: prevTop?.x ?? hub.x, y: prevTop?.y ?? hub.y, vx: 0, vy: 0, pinned: false,
    });
    if (isCollapsed) return;
    subs.forEach((sub, j) => {
      const prev = previous?.get(sub.key);
      const a = angle + ((j - (subs.length - 1) / 2) * 0.55) + wobble(g * 31 + j) * 0.2;
      const start = prev ?? { x: hub.x + Math.cos(a) * LINK_DISTANCE, y: hub.y + Math.sin(a) * LINK_DISTANCE };
      nodes.push({
        id: sub.key, key: sub.key, label: sub.name, kind: "sub", group: g, count: sub.cards.length, proposed: sub.proposed, hidden: 0,
        r: nodeRadius("sub", sub.cards.length), x: start.x, y: start.y, vx: 0, vy: 0, pinned: false,
      });
      edges.push({ source: top.key, target: sub.key });
    });
  });
  return { nodes, edges };
}

/**
 * 힘을 한 번 계산한다: ① 모든 점이 서로 밀어내고 ② 선으로 이어진 점은 적당한 거리로 당기고 ③ 가운데로 살짝 모으고 ④ 겹치지 않게 떼어 놓는다.
 * alpha(0~1)는 힘의 세기이고, 시간이 지나며 줄어든다. 돌려주는 값은 이번에 가장 빨랐던 점의 속도(작으면 거의 멈춘 것)다.
 */
export function tickGraph(graph: Graph, alpha: number): number {
  const { nodes, edges } = graph;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = wobble(i + j) || 0.1; dy = wobble(i * j + 1) || 0.1; d2 = dx * dx + dy * dy; }
      const d = Math.sqrt(d2);
      const push = (REPULSION * alpha) / d2;
      const fx = (dx / d) * push;
      const fy = (dy / d) * push;
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
      const minDist = a.r + b.r + COLLIDE_PADDING;
      if (d < minDist) {
        const shove = ((minDist - d) / d) * 0.5;
        a.x -= dx * shove * 0.5; a.y -= dy * shove * 0.5; b.x += dx * shove * 0.5; b.y += dy * shove * 0.5;
      }
    }
  }
  for (const e of edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const pull = ((d - LINK_DISTANCE) / d) * 0.08 * (0.3 + alpha);
    a.vx += dx * pull; a.vy += dy * pull; b.vx -= dx * pull; b.vy -= dy * pull;
  }
  let fastest = 0;
  for (const n of nodes) {
    n.vx -= n.x * GRAVITY * alpha;
    n.vy -= n.y * GRAVITY * alpha;
    if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
    n.vx *= DAMPING; n.vy *= DAMPING;
    n.x += n.vx; n.y += n.vy;
    fastest = Math.max(fastest, Math.hypot(n.vx, n.vy));
  }
  return fastest;
}

/** 화면을 그리지 않고 한 번에 자리를 잡는다(시험·첫 화면용). */
export function settleGraph(graph: Graph, steps = 260): Graph {
  let alpha = 1;
  for (let i = 0; i < steps; i += 1) {
    tickGraph(graph, alpha);
    alpha = Math.max(0.03, alpha * 0.985);
  }
  return graph;
}

/** 어떤 점과 선으로 바로 이어진 점들(마우스를 올렸을 때 같이 밝히는 이웃). */
export function neighborsOf(graph: Graph, id: string): Set<string> {
  const out = new Set<string>([id]);
  for (const e of graph.edges) {
    if (e.source === id) out.add(e.target);
    if (e.target === id) out.add(e.source);
  }
  return out;
}

export type ViewTransform = { k: number; x: number; y: number };

/** 모든 점이 화면 안에 들어오도록 확대·이동 값을 계산한다. */
export function fitTransform(graph: Graph, width: number, height: number, padding = 60): ViewTransform {
  if (graph.nodes.length === 0) return { k: 1, x: width / 2, y: height / 2 };
  const xs = graph.nodes.flatMap((n) => [n.x - n.r, n.x + n.r]);
  const ys = graph.nodes.flatMap((n) => [n.y - n.r, n.y + n.r]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const k = Math.max(0.2, Math.min(1.6, Math.min((width - padding * 2) / Math.max(maxX - minX, 1), (height - padding * 2) / Math.max(maxY - minY, 1))));
  return { k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k };
}

/** 마우스 자리(화면 좌표)를 기준으로 확대·축소한다. */
export function zoomAt(t: ViewTransform, factor: number, px: number, py: number, min = 0.2, max = 3): ViewTransform {
  const k = Math.max(min, Math.min(max, t.k * factor));
  const real = k / t.k;
  return { k, x: px - (px - t.x) * real, y: py - (py - t.y) * real };
}

/** 색: 상위 개념마다 하나씩(Claude 팔레트에 어울리는 차분한 색). */
export const GROUP_COLORS = ["#d97757", "#7fb1e0", "#8fc78f", "#b9a0e0", "#e3b05a", "#e08fb0", "#6fc7c0", "#c9c36f"] as const;
export const groupColor = (group: number): string => GROUP_COLORS[group % GROUP_COLORS.length];
