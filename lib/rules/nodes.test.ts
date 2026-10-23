import { describe, expect, it } from "vitest";
import { EVIDENCE_LIMITS, NODE_LIMITS, STAR_LIMITS } from "./limits";
import { canBeChild, checkAddNode, checkField, checkMoveNode, checkNodeInput, depthOf, documentNodeIds, isEffectivelyExcluded, mergeField, subtreeIds, type Evidence, type NodeKind, type NodeRef, type PortfolioStatus } from "./nodes";

const n = (id: string, parentId: string | null, kind: NodeKind, portfolioStatus: PortfolioStatus = "candidate", deletedAt: string | null = null): NodeRef => ({ id, parentId, kind, portfolioStatus, deletedAt });
const ev: Evidence = { conversationTitle: "대화 제목", conversationDate: "2026-10-01", excerpt: "원문 발췌" };

describe("checkNodeInput", () => {
  it("공백을 정리하고 기본 상태는 소재 후보다", () => {
    const r = checkNodeInput({ kind: "project", name: "  내   프로젝트 " });
    expect(r).toEqual({ ok: true, value: { kind: "project", name: "내 프로젝트", description: "", startDate: null, endDate: null, portfolioStatus: "candidate" } });
  });
  it("종류·이름·설명·날짜·상태 오류를 막는다", () => {
    expect(checkNodeInput({ kind: "x", name: "a" }).ok).toBe(false);
    expect(checkNodeInput({ kind: "project", name: "  " }).ok).toBe(false);
    expect(checkNodeInput({ kind: "project", name: "가".repeat(NODE_LIMITS.nameMaxChars + 1) }).ok).toBe(false);
    expect(checkNodeInput({ kind: "project", name: "a", description: "가".repeat(NODE_LIMITS.descriptionMaxChars + 1) }).ok).toBe(false);
    expect(checkNodeInput({ kind: "project", name: "a", startDate: "2026/01/01" }).ok).toBe(false);
    expect(checkNodeInput({ kind: "project", name: "a", startDate: "2026-02-01", endDate: "2026-01-01" }).ok).toBe(false);
    expect(checkNodeInput({ kind: "project", name: "a", portfolioStatus: "public" }).ok).toBe(false);
  });
  it("경계값(이름 60자·설명 500자)은 통과한다", () => {
    expect(checkNodeInput({ kind: "activity", name: "가".repeat(NODE_LIMITS.nameMaxChars), description: "나".repeat(NODE_LIMITS.descriptionMaxChars), startDate: "2026-01-01", endDate: "2026-01-01" }).ok).toBe(true);
  });
});

describe("부모-자식 종류 규칙", () => {
  it("세부활동은 활동 아래에만, 활동은 프로젝트·범주·맨 위에 둘 수 있다", () => {
    expect(canBeChild("activity", "subactivity")).toBe(true);
    expect(canBeChild("project", "subactivity")).toBe(false);
    expect(canBeChild(null, "subactivity")).toBe(false);
    expect(canBeChild("project", "activity")).toBe(true);
    expect(canBeChild("category", "project")).toBe(true);
    expect(canBeChild("project", "project")).toBe(false);
    expect(canBeChild("subactivity", "activity")).toBe(false);
    expect(canBeChild("study", "activity")).toBe(false);
  });
});

describe("checkAddNode", () => {
  const tree = [n("c", null, "category"), n("p", "c", "project"), n("a", "p", "activity"), n("t", "p", "activity", "candidate", "2026-10-01")];
  it("맞는 곳에는 더할 수 있다", () => {
    expect(checkAddNode(tree, null, "category").ok).toBe(true);
    expect(checkAddNode(tree, "a", "subactivity").ok).toBe(true);
  });
  it("종류 규칙·없는 부모·휴지통 부모를 막는다", () => {
    expect(checkAddNode(tree, "a", "project").ok).toBe(false);
    expect(checkAddNode(tree, "zz", "activity").ok).toBe(false);
    expect(checkAddNode(tree, "t", "subactivity").ok).toBe(false);
  });
  it("단계·개수 한도를 막는다", () => {
    const deep: NodeRef[] = Array.from({ length: NODE_LIMITS.maxDepth }, (_, i) => n(`d${i}`, i === 0 ? null : `d${i - 1}`, "category"));
    expect(depthOf(deep, `d${NODE_LIMITS.maxDepth - 1}`)).toBe(NODE_LIMITS.maxDepth);
    expect(checkAddNode(deep, `d${NODE_LIMITS.maxDepth - 1}`, "category").ok).toBe(false);
    const many = Array.from({ length: NODE_LIMITS.maxTotal }, (_, i) => n(`m${i}`, null, "category"));
    expect(checkAddNode(many, null, "category").ok).toBe(false);
  });
});

describe("checkMoveNode", () => {
  const tree = [n("c1", null, "category"), n("c2", null, "category"), n("p", "c1", "project"), n("a", "p", "activity"), n("s", "a", "subactivity")];
  it("다른 범주로 옮길 수 있고, 같은 부모면 그대로 통과한다", () => {
    expect(checkMoveNode(tree, "p", "c2").ok).toBe(true);
    expect(checkMoveNode(tree, "p", "c1").ok).toBe(true);
    expect(checkMoveNode(tree, "p", null).ok).toBe(true);
  });
  it("자기 자손 아래로는 옮길 수 없다", () => {
    expect(checkMoveNode(tree, "c1", "a").ok).toBe(false);
    expect(checkMoveNode(tree, "c1", "c1").ok).toBe(false);
  });
  it("종류 규칙을 어기는 이동을 막는다", () => {
    expect(checkMoveNode(tree, "s", "p").ok).toBe(false);
    expect(checkMoveNode(tree, "a", "c2").ok).toBe(true);
    expect(checkMoveNode(tree, "s", null).ok).toBe(false);
  });
  it("이동하면 단계 한도를 넘는 경우를 막는다", () => {
    const chain: NodeRef[] = Array.from({ length: NODE_LIMITS.maxDepth }, (_, i) => n(`k${i}`, i === 0 ? null : `k${i - 1}`, "category"));
    const sub = [...chain, n("x", null, "category"), n("y", "x", "category")];
    expect(checkMoveNode(sub, "x", `k${NODE_LIMITS.maxDepth - 1}`).ok).toBe(false);
  });
  it("없거나 휴지통에 있는 노드는 옮길 수 없다", () => {
    expect(checkMoveNode(tree, "zz", "c1").ok).toBe(false);
    expect(checkMoveNode([...tree, n("tr", null, "category", "candidate", "2026-10-01")], "tr", "c1").ok).toBe(false);
  });
});

describe("checkField", () => {
  it("항목별 한도(경계 포함)를 지킨다", () => {
    for (const [field, limit] of Object.entries(STAR_LIMITS)) {
      expect(checkField({ field, text: "가".repeat(limit), subject: "did", evidence: [ev] }, "user").ok).toBe(true);
      expect(checkField({ field, text: "가".repeat(limit + 1), subject: "did", evidence: [ev] }, "user").ok).toBe(false);
    }
  });
  it("내용이 비면 비움으로 본다", () => {
    expect(checkField({ field: "situation", text: "  ", subject: "did" }, "ai")).toEqual({ ok: true, value: { field: "situation", empty: true } });
  });
  it("AI가 쓰는 내용은 근거가 있어야 하고, 사용자가 쓰면 근거 없이도 된다", () => {
    expect(checkField({ field: "action", text: "했다", subject: "did" }, "ai").ok).toBe(false);
    expect(checkField({ field: "action", text: "했다", subject: "did", evidence: [ev] }, "ai").ok).toBe(true);
    expect(checkField({ field: "action", text: "했다", subject: "did" }, "user").ok).toBe(true);
  });
  it("외부 결과는 AI가 쓸 수 없고 사용자는 쓸 수 있다", () => {
    expect(checkField({ field: "result_external", text: "합격", subject: "did", evidence: [ev] }, "ai").ok).toBe(false);
    expect(checkField({ field: "result_external", text: "합격", subject: "did" }, "user").ok).toBe(true);
  });
  it("항목 이름·주체·근거 오류를 막는다", () => {
    expect(checkField({ field: "x", text: "a", subject: "did" }, "user").ok).toBe(false);
    expect(checkField({ field: "task", text: "a", subject: "claude" }, "user").ok).toBe(false);
    expect(checkField({ field: "task", text: "a", subject: "did", evidence: [ev, ev, ev, ev] }, "user").ok).toBe(false);
    expect(checkField({ field: "task", text: "a", subject: "did", evidence: [{ ...ev, excerpt: "가".repeat(EVIDENCE_LIMITS.excerptMaxChars + 1) }] }, "user").ok).toBe(false);
    expect(checkField({ field: "task", text: "a", subject: "did", evidence: [{ ...ev, conversationDate: "어제" }] }, "user").ok).toBe(false);
    expect(checkField({ field: "task", text: "a", subject: "did", evidence: [{ ...ev, conversationTitle: " " }] }, "user").ok).toBe(false);
  });
});

describe("mergeField", () => {
  it("비어 있으면 채운다", () => {
    expect(mergeField(null, "새 내용", "situation")).toEqual({ action: "set", text: "새 내용" });
    expect(mergeField({ text: " ", locked: false }, "새 내용", "situation")).toEqual({ action: "set", text: "새 내용" });
  });
  it("잠긴 항목은 값을 건드리지 않고 제안으로 돌린다(비어 있어도 마찬가지)", () => {
    expect(mergeField({ text: "내가 쓴 글", locked: true }, "새 내용", "action")).toEqual({ action: "suggest" });
    expect(mergeField({ text: "", locked: true }, "새 내용", "action")).toEqual({ action: "suggest" });
  });
  it("잠기지 않은 항목은 덧붙이고 기존 내용을 지우지 않는다", () => {
    expect(mergeField({ text: "기존", locked: false }, "추가", "action")).toEqual({ action: "append", text: "기존\n추가" });
  });
  it("덧붙이면 한도를 넘으면 제안으로 돌린다", () => {
    expect(mergeField({ text: "가".repeat(STAR_LIMITS.task - 3), locked: false }, "나나나나나", "task")).toEqual({ action: "suggest" });
  });
  it("이미 들어 있는 내용이나 빈 내용은 건너뛴다", () => {
    expect(mergeField({ text: "기존 내용 전체", locked: false }, "기존 내용", "action")).toEqual({ action: "skip" });
    expect(mergeField({ text: "기존", locked: true }, "  ", "action")).toEqual({ action: "skip" });
  });
});

describe("제외와 문서", () => {
  const tree = [
    n("c", null, "category"), n("p1", "c", "project", "excluded"), n("a1", "p1", "activity"), n("a2", "p1", "activity", "candidate"),
    n("p2", "c", "project"), n("a3", "p2", "activity", "excluded"), n("a4", "p2", "activity"), n("a5", "p2", "activity", "candidate", "2026-10-01"), n("s5", "a5", "subactivity"),
  ];
  it("부모가 제외되면 자식도 실질 제외, 자식만 제외해도 된다", () => {
    expect(isEffectivelyExcluded(tree, "a1")).toBe(true);
    expect(isEffectivelyExcluded(tree, "a3")).toBe(true);
    expect(isEffectivelyExcluded(tree, "a4")).toBe(false);
    expect(isEffectivelyExcluded(tree, "p2")).toBe(false);
  });
  it("문서에는 제외·휴지통(조상 포함) 노드가 빠진다", () => {
    expect(documentNodeIds(tree).sort()).toEqual(["a4", "c", "p2"]);
  });
  it("subtreeIds는 자손을 모두 모은다", () => {
    expect(subtreeIds(tree, "p1").sort()).toEqual(["a1", "a2", "p1"]);
  });
});
