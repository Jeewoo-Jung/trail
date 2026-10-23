import { describe, expect, it } from "vitest";
import { checkApplyGroup, groupKindFor, groupingBuckets, parseGroupAdvice, signatureOf, type GroupableNode } from "./grouping";
import { GROUP_LIMITS } from "./limits";
import type { NodeKind, PortfolioStatus } from "./nodes";

const n = (id: string, parentId: string | null, kind: NodeKind, over: Partial<GroupableNode & { portfolioStatus: PortfolioStatus }> = {}): GroupableNode => ({ id, parentId, kind, name: id, description: "", portfolioStatus: "candidate", deletedAt: null, ...over });
const many = (prefix: string, parentId: string | null, kind: NodeKind, count: number) => Array.from({ length: count }, (_, i) => n(`${prefix}${i}`, parentId, kind));

describe("groupKindFor", () => {
  it("한 번에 한 단계만: 활동→프로젝트, 프로젝트·범주→범주, 세부활동·학습은 묶지 않는다", () => {
    expect(groupKindFor("activity")).toBe("project");
    expect(groupKindFor("project")).toBe("category");
    expect(groupKindFor("category")).toBe("category");
    expect(groupKindFor("subactivity")).toBeNull();
    expect(groupKindFor("study")).toBeNull();
  });
});

describe("groupingBuckets", () => {
  it("같은 부모·종류의 형제가 기준 이상일 때만 후보가 된다(시드 범주 없이 맨 위 노드도)", () => {
    const nodes = [...many("a", null, "activity", GROUP_LIMITS.minSiblings), ...many("p", null, "project", GROUP_LIMITS.minSiblings - 1)];
    const b = groupingBuckets(nodes);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ parentId: null, kind: "activity", groupKind: "project" });
    expect(b[0].nodes).toHaveLength(GROUP_LIMITS.minSiblings);
  });
  it("부모가 다르거나 종류가 다르면 따로 센다", () => {
    const nodes = [n("c1", null, "category"), n("c2", null, "category"), ...many("x", "c1", "activity", 2), ...many("y", "c2", "activity", 2)];
    expect(groupingBuckets(nodes)).toEqual([]);
  });
  it("휴지통·제외(조상 포함)·이미 대기 중인 제안의 노드는 센 뒤 빠진다", () => {
    const nodes = [...many("a", null, "activity", 6), n("t", null, "activity", { deletedAt: "x" }), n("ex", null, "activity", { portfolioStatus: "excluded" })];
    const b = groupingBuckets(nodes, new Set(["a0", "a1"]));
    expect(b[0].nodes.map((x) => x.id)).toEqual(["a2", "a3", "a4", "a5"]);
    expect(groupingBuckets(nodes, new Set(["a0", "a1", "a2"]))).toEqual([]); // 3개만 남으면 기준 미달
  });
  it("프로젝트 아래의 활동은 프로젝트로 묶을 수 없다(새 프로젝트를 프로젝트 아래에 둘 수 없음)", () => {
    const nodes = [n("p", null, "project"), ...many("a", "p", "activity", 5)];
    expect(groupingBuckets(nodes)).toEqual([]);
  });
  it("노드가 많은 곳부터 돌려준다", () => {
    const nodes = [n("c", null, "category"), ...many("a", "c", "activity", 4), ...many("b", null, "activity", 6)];
    expect(groupingBuckets(nodes).map((x) => x.nodes.length)).toEqual([6, 4]);
  });
});

describe("parseGroupAdvice", () => {
  const nodes = many("a", null, "activity", 6);
  const bucket = groupingBuckets(nodes)[0];
  const known = new Set<string>();
  it("규칙에 맞는 묶음만 받는다", () => {
    const out = parseGroupAdvice({ groups: [{ ids: ["a0", "a1", "a2"], name: "  새  프로젝트 " }, { ids: ["a3", "a4"], name: "다른 프로젝트" }] }, bucket, known);
    expect(out).toEqual([
      { childIds: ["a0", "a1", "a2"], name: "새 프로젝트", kind: "project", signature: signatureOf(["a0", "a1", "a2"]) },
      { childIds: ["a3", "a4"], name: "다른 프로젝트", kind: "project", signature: signatureOf(["a3", "a4"]) },
    ]);
  });
  it("모양·수·이름·소속이 틀린 묶음은 버린다", () => {
    const bad = [
      { ids: ["a0"], name: "하나뿐" },
      { ids: Array.from({ length: GROUP_LIMITS.maxChildren + 1 }, (_, i) => `a${i}`), name: "너무 많음" },
      { ids: ["a0", "zz"], name: "없는 노드" },
      { ids: ["a0", "a1"], name: "  " },
      { ids: ["a0", "a1"], name: "가".repeat(61) },
      { ids: ["a0", 5], name: "숫자" },
      { ids: "a0,a1", name: "문자열" },
      "문자열",
      null,
    ];
    expect(parseGroupAdvice({ groups: bad }, bucket, known)).toEqual([]);
    expect(parseGroupAdvice("이상한 값", bucket, known)).toEqual([]);
    expect(parseGroupAdvice({ groups: "x" }, bucket, known)).toEqual([]);
  });
  it("한 노드는 한 묶음에만, 같은 이름이 이미 있으면 만들지 않는다", () => {
    const withNamed = groupingBuckets([...nodes.map((x, i) => (i === 0 ? { ...x, name: "기존 이름" } : x))])[0];
    const out = parseGroupAdvice({ groups: [{ ids: ["a0", "a1"], name: "기존  이름" }, { ids: ["a1", "a2"], name: "A" }, { ids: ["a2", "a3"], name: "B" }] }, withNamed, known);
    expect(out.map((o) => o.name)).toEqual(["A"]); // 첫 묶음은 이름 중복, 셋째는 a2를 이미 A가 씀
  });
  it("이미 처리한(승인·거절) 제안과 같은 묶음은 다시 만들지 않고, 한 번에 최대 개수를 지킨다", () => {
    expect(parseGroupAdvice({ groups: [{ ids: ["a1", "a0"], name: "A" }] }, bucket, new Set([signatureOf(["a0", "a1"])]))).toEqual([]);
    const lots = Array.from({ length: 10 }, (_, i) => ({ ids: [`b${i * 2}`, `b${i * 2 + 1}`], name: `묶음${i}` }));
    const big = groupingBuckets(many("b", null, "activity", 20))[0];
    expect(parseGroupAdvice({ groups: lots }, big, known)).toHaveLength(GROUP_LIMITS.maxProposalsPerRun);
  });
});

describe("checkApplyGroup", () => {
  const nodes = [n("c", null, "category"), n("a", "c", "activity"), n("b", "c", "activity"), n("x", null, "activity"), n("t", "c", "activity", { deletedAt: "t" })];
  it("같은 부모·종류의 살아 있는 노드면 승인할 수 있다", () => {
    expect(checkApplyGroup(nodes, ["a", "b"], "project")).toEqual({ ok: true, parentId: "c" });
  });
  it("노드가 없어졌거나 다른 곳으로 옮겨졌거나 휴지통이면 막는다", () => {
    expect(checkApplyGroup(nodes, ["a", "zz"], "project").ok).toBe(false);
    expect(checkApplyGroup(nodes, ["a", "t"], "project").ok).toBe(false);
    expect(checkApplyGroup(nodes, ["a", "x"], "project").ok).toBe(false);
  });
  it("묶으면 단계 한도를 넘는 가지가 생길 때 막는다", () => {
    const chain: GroupableNode[] = [n("c0", null, "category")];
    for (let i = 1; i < 6; i += 1) chain.push(n(`c${i}`, `c${i - 1}`, "category"));
    // c5 아래에 프로젝트 둘 + 그 아래 활동·세부활동까지 달아 가장 깊은 가지를 만든다(6단계 + 프로젝트 7 + 활동 8 + 세부활동 9)
    const deep = [...chain, n("pa", "c5", "project"), n("pb", "c5", "project"), n("aa", "pa", "activity"), n("ss", "aa", "subactivity")];
    expect(checkApplyGroup(deep, ["pa", "pb"], "category").ok).toBe(false);
    expect(checkApplyGroup(deep, ["aa", "ss"].slice(0, 1).concat("pb"), "category").ok).toBe(false); // 부모가 다른 노드 섞기
  });
  it("그 위치에 새 노드를 둘 수 없으면 막는다", () => {
    const nested = [n("p", null, "project"), n("a", "p", "activity"), n("b", "p", "activity")];
    expect(checkApplyGroup(nested, ["a", "b"], "project").ok).toBe(false);
  });
});
