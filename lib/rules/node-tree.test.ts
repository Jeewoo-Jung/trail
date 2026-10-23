import { describe, expect, it } from "vitest";
import { buildNodeTree, childKindsFor, EMPTY_DATA, flatten, kindChoices, mergeCandidates, moveTargets, trashedRoots, type NodeRow } from "./node-tree";

let order = 0;
const node = (id: string, parentId: string | null, kind: NodeRow["kind"], over: Partial<NodeRow> = {}): NodeRow => ({
  id, parentId, kind, name: id, description: "", startDate: null, endDate: null, portfolioStatus: "candidate", lockedFields: [], resultState: "empty", sortOrder: (order += 1), createdBy: "user", deletedAt: null, updatedAt: "2026-10-01", ...over,
});
const data = (nodes: NodeRow[], suggestions: { id: string; nodeId: string }[] = []) => ({ ...EMPTY_DATA, nodes, suggestions: suggestions.map((s) => ({ ...s, field: "action" as const, text: "t", subject: "did" as const, evidence: [], createdAt: "" })) });

describe("buildNodeTree", () => {
  const nodes = [node("c", null, "category"), node("p", "c", "project"), node("a1", "p", "activity", { startDate: "2026-02-01" }), node("a2", "p", "activity", { startDate: "2026-01-01" }), node("s", "a1", "subactivity"), node("tr", "p", "activity", { deletedAt: "2026-10-02" })];
  it("부모-자식으로 묶고, 경로·단계를 채우고, 휴지통 노드는 뺀다", () => {
    const t = buildNodeTree(data(nodes));
    expect(t.roots.map((r) => r.id)).toEqual(["c"]);
    expect(flatten(t.roots).map((n) => n.id)).toEqual(["c", "p", "a1", "s", "a2"]); // 깊이 우선, 같은 부모 안에서는 순서 값 순
    expect(t.byId.get("s")).toMatchObject({ depth: 4, path: ["c", "p", "a1", "s"] });
  });
  it("제외는 자손에게 번지고, 처리 대기 제안 수는 위로 합쳐진다", () => {
    const n2 = [node("c", null, "category"), node("p", "c", "project", { portfolioStatus: "excluded" }), node("a", "p", "activity"), node("b", "c", "project")];
    const t = buildNodeTree(data(n2, [{ id: "1", nodeId: "a" }, { id: "2", nodeId: "a" }]));
    expect(t.byId.get("a")?.effectiveExcluded).toBe(true);
    expect(t.byId.get("b")?.effectiveExcluded).toBe(false);
    expect(t.byId.get("a")?.pendingSuggestions).toBe(2);
    expect(t.byId.get("c")?.pendingSuggestions).toBe(2);
    expect(t.byId.get("b")?.pendingSuggestions).toBe(0);
  });
  it("부모가 휴지통에 있는 노드는 트리에 나오지 않는다", () => {
    const n = [node("p", null, "project", { deletedAt: "t" }), node("a", "p", "activity", { deletedAt: "t" })];
    expect(buildNodeTree(data(n)).roots).toEqual([]);
  });
});

describe("trashedRoots", () => {
  it("같은 시각에 함께 들어간 가지는 맨 위 노드만 보여 준다", () => {
    const n = [node("p", null, "project", { deletedAt: "2026-10-02" }), node("a", "p", "activity", { deletedAt: "2026-10-02" }), node("b", "p", "activity", { deletedAt: "2026-10-01" }), node("ok", null, "project")];
    expect(trashedRoots(n).map((x) => x.id).sort()).toEqual(["b", "p"]);
  });
});

describe("moveTargets / kindChoices / mergeCandidates", () => {
  const nodes = [node("c1", null, "category"), node("c2", null, "category"), node("p", "c1", "project"), node("a", "p", "activity"), node("a2", "p", "activity"), node("s", "a", "subactivity"), node("p2", "c2", "project"), node("b", "p2", "activity")];
  const tree = buildNodeTree(data(nodes));
  it("옮길 수 있는 곳만 나온다(자기 자손·잘못된 종류 제외, 맨 위 포함 여부는 규칙대로)", () => {
    const targets = moveTargets(tree, nodes, "a").map((t) => t.id);
    expect(targets).toContain("p2");
    expect(targets).toContain("c1");
    expect(targets).not.toContain("s");
    expect(targets).not.toContain("a");
    expect(moveTargets(tree, nodes, "s").map((t) => t.id)).not.toContain(null); // 세부활동은 맨 위로 못 감
    expect(moveTargets(tree, nodes, "c1").map((t) => t.id)).not.toContain("p");
  });
  it("종류 바꾸기 선택지는 부모·자식·항목 규칙을 지킨다", () => {
    const a = tree.byId.get("a")!;
    expect(kindChoices(a, tree.byId.get("p"), false)).toEqual(["activity", "study"].filter((k) => k !== "study" || a.children.length === 0));
    expect(kindChoices(tree.byId.get("a2")!, tree.byId.get("p"), true)).toEqual(["activity"]);
  });
  it("합칠 짝은 같은 종류의 관련 없는 활동이다", () => {
    expect(mergeCandidates(tree, tree.byId.get("a")!).map((c) => c.id).sort()).toEqual(["a2", "b"]);
    expect(mergeCandidates(tree, tree.byId.get("p")!)).toEqual([]);
  });
  it("종류별로 새로 만들 수 있는 하위 종류", () => {
    expect(childKindsFor(null)).toEqual(["category", "project", "activity", "study"]);
    expect(childKindsFor("activity")).toEqual(["subactivity"]);
    expect(childKindsFor("study")).toEqual([]);
  });
});
