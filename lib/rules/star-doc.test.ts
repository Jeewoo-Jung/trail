import { describe, expect, it } from "vitest";
import { EMPTY_DATA, type EvidenceRow, type FieldRow, type NodeData, type NodeRow, type OutputRow } from "./node-tree";
import { buildStarDocument, exportFileNames, toJson, toMarkdown } from "./star-doc";

let order = 0;
const n = (id: string, parentId: string | null, kind: NodeRow["kind"], name: string, over: Partial<NodeRow> = {}): NodeRow => ({
  id, parentId, kind, name, description: "", startDate: null, endDate: null, portfolioStatus: "candidate", lockedFields: [], resultState: "empty", resultSnoozeUntil: null, resultAskedAt: null, sortOrder: (order += 1), createdBy: "user", deletedAt: null, updatedAt: "2026-10-01", ...over,
});
const f = (nodeId: string, field: FieldRow["field"], text: string, subject: FieldRow["subject"] = "did"): FieldRow => ({ nodeId, field, text, subject, locked: false, updatedBy: "ai", updatedAt: "2026-10-01" });
const ev = (id: string, nodeId: string, field: EvidenceRow["field"], excerpt: string): EvidenceRow => ({ id, nodeId, field, conversationTitle: "대화 [제목]", conversationDate: "2026-09-01", excerpt });
const out = (id: string, nodeId: string, name: string, over: Partial<OutputRow> = {}): OutputRow => ({ id, nodeId, name, url: null, storagePath: null, isFinal: false, ...over });

const data: NodeData = {
  ...EMPTY_DATA,
  nodes: [
    n("cat", null, "category", "가상 범주"),
    n("p", "cat", "project", "가상 프로젝트", { startDate: "2026-08-01", endDate: "2026-09-30", description: "프로젝트 설명" }),
    n("a1", "p", "activity", "첫 활동", { startDate: "2026-08-05" }),
    n("s1", "a1", "subactivity", "세부 활동"),
    n("a2", "p", "activity", "제외된 활동", { portfolioStatus: "excluded" }),
    n("a3", "p", "activity", "휴지통 활동", { deletedAt: "2026-10-02" }),
    n("empty", "cat", "project", "빈 프로젝트"),
    n("px", null, "project", "제외 프로젝트", { portfolioStatus: "excluded" }),
    n("ax", "px", "activity", "제외 아래 활동"),
  ],
  fields: [f("a1", "situation", "# 상황 본문"), f("a1", "action", "내가 한 일", "plan"), f("a1", "task", "  "), f("s1", "result_conversation", "세부 결과"), f("a2", "task", "제외 과제"), f("ax", "task", "제외 아래 과제")],
  evidence: [ev("e1", "a1", "action", "원문 발췌"), ev("e2", "a2", "task", "제외 근거")],
  outputs: [out("o1", "a1", "보고서", { url: "https://example.com/r", isFinal: true }), out("o2", "a1", "첨부본", { storagePath: "u/n/x.pdf" })],
};

describe("buildStarDocument", () => {
  it("프로젝트 단위: 제외·휴지통 노드와 내용 없는 가지는 빠지고, 비어 있는 항목은 쓰지 않는다", () => {
    const doc = buildStarDocument(data, "p")!;
    expect(doc.root.name).toBe("가상 프로젝트");
    expect(doc.root.children.map((c) => c.name)).toEqual(["첫 활동"]);
    const a1 = doc.root.children[0];
    expect(a1.fields.map((x) => x.field)).toEqual(["situation", "action"]); // task는 비어 있어 빠짐
    expect(a1.fields[1]).toMatchObject({ subjectLabel: "내 계획", evidence: [{ excerpt: "원문 발췌" }] });
    expect(a1.outputs).toEqual([{ name: "보고서", url: "https://example.com/r", isFinal: true, hasFile: false }, { name: "첨부본", url: null, isFinal: false, hasFile: true }]);
    expect(a1.children[0].fields[0].text).toBe("세부 결과");
    expect(doc.activityCount).toBe(2); // 활동 1 + 세부활동 1
  });
  it("활동 단위도 만들 수 있다", () => {
    const doc = buildStarDocument(data, "a1")!;
    expect(doc.root.name).toBe("첫 활동");
    expect(doc.root.children.map((c) => c.name)).toEqual(["세부 활동"]);
  });
  it("제외·휴지통·없는 노드는 문서를 만들지 않는다(조상이 제외된 노드 포함)", () => {
    for (const id of ["a2", "a3", "px", "ax", "nope"]) expect(buildStarDocument(data, id), id).toBeNull();
  });
  it("전체 문서는 맨 위 노드 중 내용 있는 것만 담는다", () => {
    const doc = buildStarDocument(data, null)!;
    expect(doc.root).toMatchObject({ kind: "all", name: "Trail 전체 기록" });
    expect(doc.root.children.map((c) => c.name)).toEqual(["가상 범주"]); // 제외 프로젝트는 빠지고, 빈 프로젝트는 가지째 빠진다
    expect(doc.root.children[0].children.map((c) => c.name)).toEqual(["가상 프로젝트"]);
  });
  it("문서에 쓸 것이 없는 프로젝트도 머리로는 문서가 된다", () => {
    const doc = buildStarDocument(data, "empty")!;
    expect(doc.root.children).toEqual([]);
    expect(doc.activityCount).toBe(0);
  });
});

describe("toMarkdown", () => {
  const md = toMarkdown(buildStarDocument(data, "p")!, new Date("2026-10-30T00:00:00Z"));
  it("제목 계층·기간·항목·주체·근거·산출물을 담는다", () => {
    expect(md).toContain("# 가상 프로젝트 (2026-08-01 ~ 2026-09-30)");
    expect(md).toContain("## 첫 활동 (2026-08-05 ~ ?)");
    expect(md).toContain("### 세부 활동");
    expect(md).toContain("**내가 한 일** _(내 계획)_");
    expect(md).toContain("> “원문 발췌” — 대화 \\[제목\\], 2026-09-01");
    expect(md).toContain("- [최종] [보고서](https://example.com/r)");
    expect(md).toContain("- 첨부본 (첨부 파일 있음 — 앱에서 내려받기)");
  });
  it("본문 줄이 제목으로 바뀌지 않게 막고, 제외·휴지통 내용은 어디에도 없다", () => {
    expect(md).toContain("\\# 상황 본문");
    for (const gone of ["제외된 활동", "제외 과제", "휴지통 활동", "제외 아래", "제외 근거"]) expect(md).not.toContain(gone);
    expect(md).toContain("2026-10-30에 내려받음 · 활동 2개");
  });
});

describe("toJson / exportFileNames", () => {
  it("JSON은 형식 표시·항목별 주체와 근거·산출물을 담고 제외 노드는 없다", () => {
    const j = JSON.parse(toJson(buildStarDocument(data, "p")!, new Date("2026-10-30T00:00:00Z")));
    expect(j).toMatchObject({ format: "trail-star-document", version: 1, exportedAt: "2026-10-30T00:00:00.000Z", activityCount: 2 });
    expect(j.root.children[0].fields.action).toEqual({ text: "내가 한 일", subject: "plan", evidence: [{ conversationTitle: "대화 [제목]", conversationDate: "2026-09-01", excerpt: "원문 발췌" }] });
    expect(JSON.stringify(j)).not.toContain("제외");
    expect(JSON.stringify(j)).not.toContain("u/n/x.pdf"); // 저장 경로는 내보내지 않는다
  });
  it("파일 이름은 ASCII 대체 이름과 한글 이름을 함께 준다", () => {
    const doc = buildStarDocument(data, "p")!;
    expect(exportFileNames(doc, "md", new Date("2026-10-30T00:00:00Z"))).toEqual({ ascii: "trail-star-2026-10-30.md", utf8: "가상 프로젝트-2026-10-30.md" });
    const weird = { ...doc, root: { ...doc.root, name: '../a:b*"c' } };
    expect(exportFileNames(weird, "json", new Date("2026-10-30T00:00:00Z")).utf8).toBe("a b c-2026-10-30.json");
    expect(exportFileNames({ ...doc, root: { ...doc.root, name: "///" } }, "md", new Date("2026-10-30T00:00:00Z")).utf8).toBe("trail-2026-10-30.md");
  });
});
