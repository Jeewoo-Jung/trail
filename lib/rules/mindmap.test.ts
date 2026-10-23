import { describe, expect, it } from "vitest";
import { defaultCollapsed, FOLD_SUBS_PER_TOP, FOLD_TOTAL_NODES, layoutMindmap, MAP_SIZE, NODE_RADIUS, nodeId } from "./mindmap";
import { buildTree, type CardRow, type SubRow, type TopRow } from "./tree";

const tops: TopRow[] = [
  { id: "t1", name: "연구", sortOrder: 0 },
  { id: "t2", name: "업무", sortOrder: 1 },
];
const mkSubs = (top: string, n: number): SubRow[] => Array.from({ length: n }, (_, i) => ({ id: `${top}-s${i}`, topId: top, name: `${top}하위${i}`, status: "approved" as const }));
const card = (id: string, topId: string | null, subId: string | null): CardRow => ({ id, title: id, summary: "요약", keywords: [], evidence: ["e"], candidates: [], topId, subId, status: "done", createdAt: "2026-10-23T00:00:00Z" });

describe("layoutMindmap", () => {
  const tree = buildTree([card("a", "t1", "t1-s0"), card("b", null, null)], tops, [...mkSubs("t1", 3), ...mkSubs("t2", 2)]);

  it("루트 하나, 상위 개념(미분류 포함), 하위 개념을 점으로 만들고 가지(선)로 잇는다", () => {
    const layout = layoutMindmap(tree, new Set());
    expect(layout.nodes.filter((n) => n.kind === "root")).toHaveLength(1);
    expect(layout.nodes.filter((n) => n.kind === "top").map((n) => n.label)).toEqual(["연구", "업무", "미분류"]);
    expect(layout.nodes.filter((n) => n.kind === "sub")).toHaveLength(5);
    expect(layout.edges).toHaveLength(layout.nodes.length - 1); // 트리이므로 선은 점보다 하나 적다
  });
  it("모든 점이 그림 영역 안에 있고 서로 겹치지 않는다", () => {
    const { nodes } = layoutMindmap(tree, new Set());
    for (const n of nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(MAP_SIZE);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(MAP_SIZE);
    }
    expect(new Set(nodes.map((n) => `${n.x},${n.y}`)).size).toBe(nodes.length);
  });
  it("접은 상위 개념은 하위 점을 그리지 않고 숨긴 개수를 알려 준다", () => {
    const layout = layoutMindmap(tree, new Set(["top:t1"]));
    const t1 = layout.nodes.find((n) => n.key === "top:t1");
    expect(t1?.hidden).toBeGreaterThan(0);
    expect(layout.nodes.some((n) => n.key?.startsWith("sub:t1-"))).toBe(false);
    expect(layout.nodes.some((n) => n.key?.startsWith("sub:t2-"))).toBe(true);
  });
  it("노드 키는 트리 화면과 같고, 카드 수도 같다", () => {
    const layout = layoutMindmap(tree, new Set());
    expect(layout.nodes.find((n) => n.key === "top:t1")?.count).toBe(1);
    expect(layout.nodes.map(nodeId)).toContain("root");
  });
  it("상위 개념이 하나뿐이어도 배치된다", () => {
    const one = buildTree([], [tops[0]], mkSubs("t1", 2));
    expect(layoutMindmap(one, new Set()).nodes).toHaveLength(4);
  });
});

describe("defaultCollapsed", () => {
  it("하위 개념이 기준보다 많은 상위 개념만 접는다", () => {
    const t = buildTree([], tops, [...mkSubs("t1", FOLD_SUBS_PER_TOP + 1), ...mkSubs("t2", 2)]);
    expect([...defaultCollapsed(t)]).toEqual(["top:t1"]);
  });
  it("기준 이하면 아무것도 접지 않는다", () => {
    expect(defaultCollapsed(buildTree([], tops, mkSubs("t1", FOLD_SUBS_PER_TOP)))).toEqual(new Set());
  });
  it("전체 노드가 너무 많으면 상위 개념을 모두 접는다", () => {
    const manyTops: TopRow[] = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, name: `상위${i}`, sortOrder: i }));
    const subs = manyTops.flatMap((t) => mkSubs(t.id, 7));
    expect(defaultCollapsed(buildTree([], manyTops, subs)).size).toBe(6);
  });
});

describe("겹침 방지", () => {
  it("처음 접는 기준을 적용한 모든 조합에서 점이 서로 겹치지 않는다", () => {
    for (let topCount = 1; topCount <= 8; topCount += 1) {
      for (let subsPerTop = 0; subsPerTop <= FOLD_SUBS_PER_TOP + 2; subsPerTop += 1) {
        const topRows: TopRow[] = Array.from({ length: topCount }, (_, i) => ({ id: `t${i}`, name: `상위${i}`, sortOrder: i }));
        const subRows = topRows.flatMap((t) => mkSubs(t.id, subsPerTop));
        const tree = buildTree([], topRows, subRows);
        const { nodes } = layoutMindmap(tree, defaultCollapsed(tree));
        for (let a = 0; a < nodes.length; a += 1) {
          for (let b = a + 1; b < nodes.length; b += 1) {
            const dist = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
            const need = NODE_RADIUS[nodes[a].kind] + NODE_RADIUS[nodes[b].kind];
            expect(dist, `상위 ${topCount}개, 하위 ${subsPerTop}개씩`).toBeGreaterThanOrEqual(need);
          }
        }
      }
    }
    expect(FOLD_TOTAL_NODES).toBeGreaterThan(0);
  });
});
