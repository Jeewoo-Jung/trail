import { describe, expect, it } from "vitest";
import { extractRules, loadRecordRules, RULES_NOTE } from "./record-rules";

describe("extractRules", () => {
  it("붙여 넣기 구간만 꺼낸다", () => {
    const md = "설명\n\n=== 붙여 넣기 시작 ===\n\n## 규칙\n내용\n\n=== 붙여 넣기 끝 ===\n뒤";
    expect(extractRules(md)).toBe("## 규칙\n내용");
  });
  it("설명문 속에 같은 표시가 있어도 줄 처음의 표시만 쓴다", () => {
    const md = "아래 `=== 붙여 넣기 시작 ===`부터\n\n=== 붙여 넣기 시작 ===\nX\n=== 붙여 넣기 끝 ===";
    expect(extractRules(md)).toBe("X");
  });
  it("표시가 없거나 비어 있으면 null", () => {
    expect(extractRules("그냥 글")).toBeNull();
    expect(extractRules("\n=== 붙여 넣기 시작 ===\n\n=== 붙여 넣기 끝 ===")).toBeNull();
  });
});

describe("loadRecordRules", () => {
  it("실제 규칙 문서를 읽어 목록 안내와 함께 돌려준다", async () => {
    const rules = await loadRecordRules();
    expect(rules).toContain("Trail 기록 규칙");
    expect(rules).toContain("list_cards");
    expect(rules?.endsWith(RULES_NOTE)).toBe(true);
    expect(RULES_NOTE).toContain("activities");
    expect(RULES_NOTE).not.toContain("사용자 지침");
  });
});
