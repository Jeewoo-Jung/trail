import { describe, expect, it } from "vitest";
import { exportCards, toJson, toMarkdown } from "./export";
import { buildTree, type CardRow, type ConceptRow } from "./tree";

const concepts: ConceptRow[] = [
  { id: "t1", parentId: null, name: "취업준비", status: "approved", sortOrder: 0 },
  { id: "s1", parentId: "t1", name: "인턴 활동", status: "approved", sortOrder: 0 },
  { id: "d1", parentId: "s1", name: "성과 정리", status: "approved", sortOrder: 0 },
];
const card = (id: string, conceptId: string | null, extra: Partial<CardRow> = {}): CardRow => ({
  id, title: `제목${id}`, summary: "요약", keywords: ["a"], evidence: ["근거1", "근거2"], candidates: [],
  conceptId, status: "done", createdAt: "2026-10-23T03:00:00Z", ...extra,
});
const at = new Date("2026-10-24T00:00:00Z");

describe("내려받기", () => {
  const tree = buildTree([card("1", "d1"), card("2", null, { evidence: [], summary: "아마 그렇다(추정)" })], concepts);

  it("JSON에는 화면과 같은 카드 데이터와 근거 발췌, 개념 경로가 모두 들어 있다", () => {
    const parsed = JSON.parse(toJson(tree, at));
    expect(parsed.exportedAt).toBe("2026-10-24T00:00:00.000Z");
    expect(parsed.cards).toHaveLength(2);
    const c1 = parsed.cards.find((c: { id: string }) => c.id === "1");
    expect(c1).toMatchObject({ path: ["취업준비", "인턴 활동", "성과 정리"], top: "취업준비", sub: "인턴 활동", evidence: ["근거1", "근거2"], keywords: ["a"] });
    const c2 = parsed.cards.find((c: { id: string }) => c.id === "2");
    expect(c2).toMatchObject({ path: [], top: null, hasEstimate: true, noEvidence: true });
  });
  it("Markdown은 개념 경로별로 묶고 근거·추정·근거 없음을 표시한다", () => {
    const md = toMarkdown(tree, at);
    expect(md).toContain("## 취업준비 > 인턴 활동 > 성과 정리");
    expect(md).toContain("## 미분류");
    expect(md).toContain("### 제목1");
    expect(md).toContain("> “근거1”");
    expect(md).toContain("> “근거2”");
    expect(md).toContain("> 근거 없음");
    expect(md).toContain("추정이 포함돼 있습니다");
  });
  it("제목의 줄바꿈이 Markdown 제목을 깨지 않는다", () => {
    const t = buildTree([card("1", "s1", { title: "줄\n바꿈\n# 가짜 제목" })], concepts);
    expect(toMarkdown(t, at)).toContain("### 줄 바꿈 # 가짜 제목");
  });
  it("카드가 없으면 안내 문구를 쓴다", () => {
    expect(toMarkdown(buildTree([], concepts), at)).toContain("기록된 카드가 없습니다.");
    expect(exportCards(buildTree([], concepts))).toEqual([]);
  });
});
