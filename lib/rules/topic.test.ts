import { describe, expect, it } from "vitest";
import { cleanTopicList, isExcludedTopic, normalizeTopic } from "./topic";

describe("normalizeTopic", () => {
  it("공백과 대소문자를 없앤다", () => {
    expect(normalizeTopic("  Embedding  비교 ")).toBe("embedding비교");
    expect(normalizeTopic("A B\tC\nD")).toBe("abcd");
  });

  it("풀어 쓴 한글도 합쳐서 같게 본다", () => {
    expect(normalizeTopic("가나".normalize("NFD"))).toBe(normalizeTopic("가나"));
  });
});

describe("cleanTopicList", () => {
  it("빈 것을 버리고, 공백·대소문자만 다른 것은 처음 것만 남긴다", () => {
    expect(cleanTopicList(["  연구 ", "", "   ", "연 구", "Research", "research", "업무"])).toEqual([
      "연구",
      "Research",
      "업무",
    ]);
  });

  it("빈 목록은 빈 목록이다", () => {
    expect(cleanTopicList([])).toEqual([]);
  });
});

describe("isExcludedTopic", () => {
  const excluded = ["개인 일기", "Secret Project"];

  it("공백·대소문자를 무시하고 같으면 제외다", () => {
    expect(isExcludedTopic("개인일기", excluded)).toBe(true);
    expect(isExcludedTopic("  secret   project ", excluded)).toBe(true);
  });

  it("부분만 같으면 제외가 아니다", () => {
    expect(isExcludedTopic("개인", excluded)).toBe(false);
    expect(isExcludedTopic("개인 일기장", excluded)).toBe(false);
  });

  it("빈 주제 키는 제외로 보지 않고, 제외 목록이 비어 있어도 제외가 아니다", () => {
    expect(isExcludedTopic("   ", ["", " "])).toBe(false);
    expect(isExcludedTopic("연구", [])).toBe(false);
  });
});
