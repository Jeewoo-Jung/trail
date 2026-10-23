import { describe, expect, it } from "vitest";
import { parseBlockedInput } from "./settings";

describe("parseBlockedInput", () => {
  it("줄바꿈과 쉼표로 나누고 공백·빈 줄·중복을 정리한다", () => {
    expect(parseBlockedInput(" 개인 일기 \n\n개인일기, 가족 \n,")).toEqual({ ok: true, topics: ["개인 일기", "가족"] });
  });
  it("비어 있으면 빈 목록", () => {
    expect(parseBlockedInput("  \n ")).toEqual({ ok: true, topics: [] });
  });
  it("50개를 넘으면 거절한다", () => {
    const text = Array.from({ length: 51 }, (_, i) => `주제${i}`).join("\n");
    expect(parseBlockedInput(text)).toMatchObject({ ok: false });
    expect(parseBlockedInput(Array.from({ length: 50 }, (_, i) => `주제${i}`).join("\n")).ok).toBe(true);
  });
  it("이름이 60자를 넘으면 거절한다", () => {
    expect(parseBlockedInput("가".repeat(61))).toMatchObject({ ok: false });
    expect(parseBlockedInput("가".repeat(60)).ok).toBe(true);
  });
});
