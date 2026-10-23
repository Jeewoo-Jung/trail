// Design Ref: DESIGN.md §14.5(마인드맵은 보조 화면) — 옵시디언 그래프 보기처럼 점들이 서로 밀어내고 선이 당기는 힘으로 자리를 잡는 배치.
// 화면(components/mindmap.tsx)이 이 계산을 매 프레임 돌리고, 계산 자체는 화면과 무관하게 시험할 수 있도록 여기에 둔다.
import { hasStar } from "./nodes";
import type { TreeNode } from "./node-tree";

/** 그래프가 읽는 트리 모양. 노드 트리(TreeNode)에서 toGraphSource로 만든다. */
export type GraphSource = { key: string; name: string; depth: number; /** 아래(포함)의 활동·세부활동 수 */ count: number; /** 제외(조상 포함) 상태 */ excluded: boolean; children: GraphSource[] };

/** 노드 트리를 그래프 입력으로 바꾼다. 점의 크기는 아래에 있는 활동 수를 따른다. */
export function toGraphSource(roots: readonly TreeNode[]): GraphSource[] {
  const conv = (n: TreeNode): GraphSource => {
    const children = n.children.map(conv);
    return { key: n.id, name: n.name, depth: n.depth, count: (hasStar(n.kind) ? 1 : 0) + children.reduce((sum, c) => sum + c.count, 0), excluded: n.effectiveExcluded, children };
  };
  return roots.map(conv);
}

/** 접는 기준. 한 노드의 자식이 이보다 많거나, 전체 점이 이보다 많으면 일부를 처음부터 접어 둔다. */
export const FOLD_CHILDREN = 8;
export const FOLD_TOTAL_NODES = 40;
export const FOLD_ALL_NODES = 120;

export type GraphNode = {
  id: string;
  /** 트리 화면과 같은 키 */
  key: string;
  label: string;
  /** 뿌리(맨 위 노드)는 top, 그 아래는 모두 sub */
  kind: "top" | "sub";
  /** 뿌리가 1 */
  depth: number;
  /** 뿌리의 순번. 같은 뿌리 아래의 점은 같은 색으로 보인다 */
  group: number;
  count: number;
  /** 제외 상태(점선·흐리게 그린다) */
  excluded: boolean;
  /** 접혀서 숨겨진 하위 노드 수(그 아래 전부) */
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

const MIN_R = [0, 9, 6, 5, 4, 4] as const;

/** 카드가 많을수록 점이 조금 커진다(옵시디언은 연결이 많을수록 커진다). 깊은 개념일수록 작다. */
export function nodeRadius(depth: number, count: number): number {
  const base = MIN_R[Math.min(depth, 5)];
  const extra = Math.min(Math.sqrt(count) * (depth === 1 ? 2.2 : 2.6), depth === 1 ? 14 : 10);
  return Math.round((base + extra) * 10) / 10;
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

const countAll = (n: GraphSource): number => n.children.reduce((s, k) => s + 1 + countAll(k), 0);
const allNodes = (tree: readonly GraphSource[]): GraphSource[] => tree.flatMap((n) => [n, ...allNodes(n.children)]);

/** 처음에 접어 둘 개념. 점이 많아질수록 더 많이 접는다. */
export function defaultCollapsedGraph(tree: readonly GraphSource[]): Set<string> {
  const nodes = allNodes(tree);
  const total = nodes.length;
  return new Set(
    nodes
      .filter((n) => n.children.length > 0)
      .filter((n) => total > FOLD_ALL_NODES || n.children.length > FOLD_CHILDREN || (total > FOLD_TOTAL_NODES && n.depth >= 2))
      .map((n) => n.key),
  );
}

/** 트리에서 점과 선을 만든다. previous가 있으면 같은 점은 있던 자리에서 이어 간다. */
export function buildGraph(tree: readonly GraphSource[], collapsed: ReadonlySet<string>, previous?: ReadonlyMap<string, { x: number; y: number }>): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const ring = Math.max(1, tree.length);
  let counter = 0;

  const place = (node: GraphSource, group: number, x: number, y: number, outward: number, parentKey: string | null) => {
    const isCollapsed = node.children.length > 0 && collapsed.has(node.key);
    const prev = previous?.get(node.key);
    nodes.push({
      id: node.key, key: node.key, label: node.name, kind: node.depth === 1 ? "top" : "sub", depth: node.depth, group, count: node.count,
      excluded: node.excluded, hidden: isCollapsed ? countAll(node) : 0, r: nodeRadius(node.depth, node.count),
      x: prev?.x ?? x, y: prev?.y ?? y, vx: 0, vy: 0, pinned: false,
    });
    if (parentKey) edges.push({ source: parentKey, target: node.key });
    if (isCollapsed) return;
    const n = node.children.length;
    const spread = 0.62 / Math.sqrt(node.depth);
    const dist = LINK_DISTANCE * Math.pow(0.92, node.depth - 1);
    node.children.forEach((child, j) => {
      const a = outward + (j - (n - 1) / 2) * spread + wobble(++counter) * 0.2;
      place(child, group, x + Math.cos(a) * dist, y + Math.sin(a) * dist, a, node.key);
    });
  };

  tree.forEach((root, g) => {
    const angle = -Math.PI / 2 + (g * 2 * Math.PI) / ring;
    place(root, g, Math.cos(angle) * 170, Math.sin(angle) * 170, angle, null);
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
        // 고정한 점은 밀리지 않는다. 한쪽만 고정이면 반대쪽이 전부 비켜 준다.
        const wa = a.pinned ? 0 : 1;
        const wb = b.pinned ? 0 : 1;
        if (wa + wb > 0) {
          const fa = (wa / (wa + wb)) * shove;
          const fb = (wb / (wa + wb)) * shove;
          a.x -= dx * fa; a.y -= dy * fa; b.x += dx * fb; b.y += dy * fb;
        }
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

/** 색: 상위 개념마다 하나씩(Glass Iris 팔레트: 파랑·보라·청록 계열). */
export const GROUP_COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#bf5af2", "#ff453a", "#64d2ff", "#ffd60a", "#ff6482"] as const;
export const groupColor = (group: number): string => GROUP_COLORS[group % GROUP_COLORS.length];
