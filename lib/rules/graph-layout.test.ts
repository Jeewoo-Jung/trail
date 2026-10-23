import { describe, expect, it } from "vitest";
import { buildGraph, defaultCollapsedGraph, fitTransform, FOLD_CHILDREN, FOLD_TOTAL_NODES, groupColor, GROUP_COLORS, neighborsOf, nodeRadius, settleGraph, tickGraph, zoomAt } from "./graph-layout";
import { buildTree, nodeKey, type CardRow, type ConceptRow } from "./tree";

const k = (id: string, parentId: string | null, name: string, status: ConceptRow["status"] = "approved", sortOrder = 0): ConceptRow => ({ id, parentId, name, status, sortOrder });
const card = (id: string, conceptId: string): CardRow => ({ id, title: id, summary: "요약", keywords: [], evidence: ["e"], candidates: [], conceptId, status: "done", createdAt: "2026-10-23T00:00:00Z" });

// 연구(3단계까지) · 업무 · 생활(하위 2개)
const concepts: ConceptRow[] = [
  k("t1", null, "연구", "approved", 0), k("t1a", "t1", "임베딩"), k("t1a1", "t1a", "문장 임베딩"), k("t1b", "t1", "평가", "proposed"),
  k("t2", null, "업무", "approved", 1), k("t2a", "t2", "회의"), k("t2b", "t2", "도구"),
  k("t3", null, "생활", "approved", 2), k("t3a", "t3", "가계"), k("t3b", "t3", "운동", "proposed"),
];
// 제안 중인 개념에도 카드를 하나씩 둔다(카드가 없는 제안은 트리에서 숨겨지기 때문)
const tree = buildTree([card("a", "t1a1"), card("b", "t1b"), card("c", "t2a"), card("d", "t3b")], concepts);

describe("buildGraph", () => {
  it("보이는 개념마다 점 하나, 자식마다 부모로 가는 선 하나를 만든다(루트 점은 없다)", () => {
    const g = buildGraph(tree, new Set());
    expect(g.nodes.filter((n) => n.kind === "top").map((n) => n.label)).toEqual(["연구", "업무", "생활"]);
    expect(g.nodes.map((n) => n.depth)).toContain(3);
    expect(g.edges).toHaveLength(g.nodes.length - 3); // 뿌리 3개를 뺀 나머지가 모두 부모에 이어진다
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length);
  });
  it("접은 개념은 그 아래를 모두 그리지 않고 숨은 개수를 알려 준다", () => {
    const g = buildGraph(tree, new Set([nodeKey("t1")]));
    const t1 = g.nodes.find((n) => n.key === nodeKey("t1"))!;
    expect(t1.hidden).toBe(3); // 임베딩, 문장 임베딩, 평가
    expect(g.nodes.some((n) => n.key === nodeKey("t1a1"))).toBe(false);
  });
  it("같은 점은 이전 자리에서 이어 가고, 같은 뿌리 아래 점은 같은 그룹이다", () => {
    const first = buildGraph(tree, new Set());
    const prev = new Map(first.nodes.map((n) => [n.key, { x: n.x + 5, y: n.y + 7 }]));
    const again = buildGraph(tree, new Set(), prev);
    expect(again.nodes[0].x).toBe(first.nodes[0].x + 5);
    expect(first.nodes.filter((n) => n.group === 0).map((n) => n.label).sort()).toEqual(["문장 임베딩", "연구", "임베딩", "평가"]);
  });
  it("제안 중인 개념을 표시하고, 카드가 많을수록·얕을수록 점이 크다", () => {
    expect(buildGraph(tree, new Set()).nodes.filter((n) => n.proposed).map((n) => n.label).sort()).toEqual(["운동", "평가"]);
    expect(nodeRadius(2, 9)).toBeGreaterThan(nodeRadius(2, 0));
    expect(nodeRadius(1, 0)).toBeGreaterThan(nodeRadius(2, 0));
    expect(nodeRadius(2, 0)).toBeGreaterThan(nodeRadius(4, 0));
  });
});

describe("defaultCollapsedGraph", () => {
  const wide = (n: number, parent = "w") => Array.from({ length: n }, (_, i) => k(`${parent}${i}`, parent === "w" ? null : parent, `이름${parent}${i}`));
  it("작은 트리는 아무것도 접지 않는다", () => {
    expect(defaultCollapsedGraph(tree)).toEqual(new Set());
  });
  it("자식이 기준보다 많은 개념은 접는다", () => {
    const cs = [k("p", null, "넓은"), ...wide(FOLD_CHILDREN + 1, "p")];
    const t = buildTree([], cs);
    expect([...defaultCollapsedGraph(t)]).toEqual([nodeKey("p")]);
  });
  it("점이 너무 많으면 2단계 이하의 가지 있는 개념을 접는다", () => {
    const roots = Array.from({ length: 6 }, (_, i) => k(`r${i}`, null, `뿌리${i}`));
    const mids = roots.flatMap((r) => Array.from({ length: 6 }, (_, j) => k(`${r.id}m${j}`, r.id, `${r.name}중${j}`)));
    const leaves = mids.map((m) => k(`${m.id}x`, m.id, `${m.name}끝`));
    const t = buildTree([], [...roots, ...mids, ...leaves]);
    expect(t.length + mids.length + leaves.length).toBeGreaterThan(FOLD_TOTAL_NODES);
    const folded = defaultCollapsedGraph(t);
    expect(folded.has(nodeKey(mids[0].id))).toBe(true);
    expect(folded.has(nodeKey(roots[0].id))).toBe(false); // 뿌리는 열어 둔다
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
    const a = by.get(nodeKey("t1a1"))!; const b = by.get(nodeKey("t3a"))!;
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
  it("이웃: 자기 자신과 선으로 이어진 점(부모와 자식)", () => {
    const g = buildGraph(tree, new Set());
    expect([...neighborsOf(g, nodeKey("t1a"))].sort()).toEqual([nodeKey("t1"), nodeKey("t1a"), nodeKey("t1a1")].sort());
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
  it("색은 뿌리마다 돌려 가며 쓴다", () => {
    expect(groupColor(0)).toBe(GROUP_COLORS[0]);
    expect(groupColor(GROUP_COLORS.length)).toBe(GROUP_COLORS[0]);
  });
});
