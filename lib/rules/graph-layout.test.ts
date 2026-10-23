import { describe, expect, it } from "vitest";
import { buildGraph, fitTransform, groupColor, GROUP_COLORS, neighborsOf, nodeRadius, settleGraph, tickGraph, zoomAt } from "./graph-layout";
import { buildTree, type CardRow, type SubRow, type TopRow } from "./tree";

const tops: TopRow[] = [
  { id: "t1", name: "연구", sortOrder: 0 },
  { id: "t2", name: "업무", sortOrder: 1 },
  { id: "t3", name: "생활", sortOrder: 2 },
];
const mkSubs = (top: string, n: number): SubRow[] => Array.from({ length: n }, (_, i) => ({ id: `${top}-s${i}`, topId: top, name: `${top}하위${i}`, status: i === 1 ? ("proposed" as const) : ("approved" as const) }));
const card = (id: string, topId: string, subId: string): CardRow => ({ id, title: id, summary: "요약", keywords: [], evidence: ["e"], candidates: [], topId, subId, status: "done", createdAt: "2026-10-23T00:00:00Z" });
// 제안 중인 하위 개념(s1)에도 카드를 하나씩 둔다(카드가 없는 제안은 트리에서 숨겨지기 때문)
const tree = buildTree([card("a", "t1", "t1-s0"), card("b", "t1", "t1-s1"), card("c", "t2", "t2-s0"), card("d", "t2", "t2-s1"), card("e", "t3", "t3-s1")], tops, [...mkSubs("t1", 4), ...mkSubs("t2", 3), ...mkSubs("t3", 2)]);

describe("buildGraph", () => {
  it("상위·하위 개념마다 점 하나, 하위마다 상위로 가는 선 하나를 만든다(루트 점은 없다)", () => {
    const g = buildGraph(tree, new Set());
    expect(g.nodes.filter((n) => n.kind === "top").map((n) => n.label)).toEqual(["연구", "업무", "생활"]);
    expect(g.nodes.filter((n) => n.kind === "sub")).toHaveLength(9);
    expect(g.edges).toHaveLength(9);
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length);
  });
  it("접은 상위 개념은 하위 점이 없고 숨은 개수를 알려 준다", () => {
    const g = buildGraph(tree, new Set(["top:t1"]));
    expect(g.nodes.find((n) => n.key === "top:t1")?.hidden).toBe(4);
    expect(g.nodes.some((n) => n.key.startsWith("sub:t1-"))).toBe(false);
  });
  it("같은 점은 이전 자리에서 이어 간다", () => {
    const first = buildGraph(tree, new Set());
    const prev = new Map(first.nodes.map((n) => [n.key, { x: n.x + 5, y: n.y + 7 }]));
    const again = buildGraph(tree, new Set(), prev);
    expect(again.nodes[0].x).toBe(first.nodes[0].x + 5);
  });
  it("제안 중인 하위 개념을 표시하고, 카드가 많을수록 점이 커진다", () => {
    const g = buildGraph(tree, new Set());
    expect(g.nodes.filter((n) => n.proposed)).toHaveLength(3);
    expect(nodeRadius("sub", 9)).toBeGreaterThan(nodeRadius("sub", 0));
    expect(nodeRadius("top", 0)).toBeGreaterThan(nodeRadius("sub", 0));
  });
});

describe("힘 계산", () => {
  it("자리를 잡으면 숫자가 깨지지 않고 점들이 겹치지 않으며 거의 멈춘다", () => {
    const g = settleGraph(buildGraph(tree, new Set()), 400);
    for (const n of g.nodes) { expect(Number.isFinite(n.x)).toBe(true); expect(Number.isFinite(n.y)).toBe(true); }
    for (let i = 0; i < g.nodes.length; i += 1) for (let j = i + 1; j < g.nodes.length; j += 1) {
      const a = g.nodes[i]; const b = g.nodes[j];
      expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.label}-${b.label}`).toBeGreaterThanOrEqual(a.r + b.r);
    }
    expect(tickGraph(g, 0.03)).toBeLessThan(1);
  });
  it("선으로 이어진 점은 이어지지 않은 점보다 가깝다", () => {
    const g = settleGraph(buildGraph(tree, new Set()), 400);
    const by = new Map(g.nodes.map((n) => [n.id, n]));
    const linked = g.edges.map((e) => Math.hypot(by.get(e.source)!.x - by.get(e.target)!.x, by.get(e.source)!.y - by.get(e.target)!.y));
    const a = by.get("sub:t1-s0")!; const b = by.get("sub:t3-s0")!;
    expect(Math.max(...linked)).toBeLessThan(Math.hypot(a.x - b.x, a.y - b.y));
  });
  it("같은 입력은 같은 결과가 나온다(무작위 없음)", () => {
    const a = settleGraph(buildGraph(tree, new Set()), 120);
    const b = settleGraph(buildGraph(tree, new Set()), 120);
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
  });
  it("고정한 점은 힘을 받아도 움직이지 않는다", () => {
    const g = buildGraph(tree, new Set());
    g.nodes[0].pinned = true;
    const { x, y } = g.nodes[0];
    settleGraph(g, 50);
    expect([g.nodes[0].x, g.nodes[0].y]).toEqual([x, y]);
  });
  it("점이 정확히 같은 자리에서 시작해도 멀어진다", () => {
    const g = buildGraph(tree, new Set());
    for (const n of g.nodes) { n.x = 0; n.y = 0; }
    settleGraph(g, 200);
    expect(new Set(g.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`)).size).toBeGreaterThan(g.nodes.length / 2);
  });
});

describe("보조 함수", () => {
  it("이웃: 자기 자신과 선으로 이어진 점", () => {
    const g = buildGraph(tree, new Set());
    expect([...neighborsOf(g, "top:t3")].sort()).toEqual(["sub:t3-s0", "sub:t3-s1", "top:t3"]);
  });
  it("맞춤: 모든 점이 화면 안에 들어온다", () => {
    const g = settleGraph(buildGraph(tree, new Set()), 300);
    const t = fitTransform(g, 800, 600);
    for (const n of g.nodes) {
      const sx = n.x * t.k + t.x; const sy = n.y * t.k + t.y;
      expect(sx).toBeGreaterThan(0); expect(sx).toBeLessThan(800); expect(sy).toBeGreaterThan(0); expect(sy).toBeLessThan(600);
    }
  });
  it("확대: 마우스가 가리키는 자리는 그대로 있다", () => {
    const t = zoomAt({ k: 1, x: 100, y: 50 }, 2, 300, 200);
    expect((300 - t.x) / t.k).toBeCloseTo((300 - 100) / 1);
    expect(zoomAt({ k: 1, x: 0, y: 0 }, 100, 0, 0).k).toBe(3);
    expect(zoomAt({ k: 1, x: 0, y: 0 }, 0.001, 0, 0).k).toBe(0.2);
  });
  it("색은 상위 개념마다 돌려 가며 쓴다", () => {
    expect(groupColor(0)).toBe(GROUP_COLORS[0]);
    expect(groupColor(GROUP_COLORS.length)).toBe(GROUP_COLORS[0]);
  });
});
