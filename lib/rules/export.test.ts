import { describe, expect, it } from "vitest";
import { exportCards, toJson, toMarkdown } from "./export";
import { buildTree, type CardRow } from "./tree";

const tops = [{ id: "t1", name: "취업준비", sortOrder: 0 }];
const subs = [{ id: "s1", topId: "t1", name: "인턴 활동", status: "approved" as const }];
const card = (id: string, extra: Partial<CardRow> = {}): CardRow => ({
  id, title: `제목${id}`, summary: "요약", keywords: ["a"], evidence: ["근거1", "근거2"], candidates: [],
  topId: "t1", subId: "s1", status: "done", createdAt: "2026-10-23T03:00:00Z", ...extra,
});
const at = new Date("2026-10-24T00:00:00Z");

describe("내려받기", () => {
  const tree = buildTree([card("1"), card("2", { topId: null, subId: null, evidence: [], summary: "아마 그렇다(추정)" })], tops, subs);

  it("JSON에는 화면과 같은 카드 데이터와 근거 발췌가 모두 들어 있다", () => {
    const parsed = JSON.parse(toJson(tree, at));
    expect(parsed.exportedAt).toBe("2026-10-24T00:00:00.000Z");
    expect(parsed.cards).toHaveLength(2);
    const c1 = parsed.cards.find((c: { id: string }) => c.id === "1");
    expect(c1).toMatchObject({ top: "취업준비", sub: "인턴 활동", evidence: ["근거1", "근거2"], keywords: ["a"] });
    const c2 = parsed.cards.find((c: { id: string }) => c.id === "2");
    expect(c2).toMatchObject({ top: null, hasEstimate: true, noEvidence: true });
  });
  it("Markdown은 개념별로 묶고 근거·추정·근거 없음을 표시한다", () => {
    const md = toMarkdown(tree, at);
    expect(md).toContain("## 취업준비 > 인턴 활동");
    expect(md).toContain("## 미분류");
    expect(md).toContain("### 제목1");
    expect(md).toContain("> “근거1”");
    expect(md).toContain("> “근거2”");
    expect(md).toContain("> 근거 없음");
    expect(md).toContain("추정이 포함돼 있습니다");
  });
  it("제목의 줄바꿈이 Markdown 제목을 깨지 않는다", () => {
    const t = buildTree([card("1", { title: "줄\n바꿈\n# 가짜 제목" })], tops, subs);
    expect(toMarkdown(t, at)).toContain("### 줄 바꿈 # 가짜 제목");
  });
  it("카드가 없으면 안내 문구를 쓴다", () => {
    expect(toMarkdown(buildTree([], tops, subs), at)).toContain("기록된 카드가 없습니다.");
    expect(exportCards(buildTree([], tops, subs))).toEqual([]);
  });
});
