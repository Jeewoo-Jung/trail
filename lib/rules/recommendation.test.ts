import { describe, expect, it } from "vitest";
import { checkApproved, parseRecommendation, TOP_CONCEPTS_MAX_TOTAL } from "./recommendation";

describe("parseRecommendation", () => {
  it("이름과 이유를 받고 앞뒤 공백·중복(공백·대소문자 무시)을 정리한다", () => {
    const r = parseRecommendation({ topConcepts: [{ name: " 연구 ", reason: "자주 나옴" }, { name: "연 구", reason: "x" }], projectTopics: [{ name: "Trail 앱", reason: "r" }] }, [], []);
    expect(r.topConcepts).toEqual([{ name: "연구", reason: "자주 나옴" }]);
    expect(r.projectTopics).toEqual([{ name: "Trail 앱", reason: "r" }]);
  });
  it("이미 있는 상위 개념·주제와 겹치는 후보는 버린다", () => {
    const r = parseRecommendation({ topConcepts: [{ name: "취업준비" }, { name: "연구" }], projectTopics: [{ name: "trail 앱" }] }, ["취업 준비"], ["Trail 앱"]);
    expect(r.topConcepts.map((c) => c.name)).toEqual(["연구"]);
    expect(r.projectTopics).toEqual([]);
  });
  it("상위 개념은 이미 있는 것까지 합쳐 10개를 넘기지 않는다", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ name: `개념${i}` }));
    expect(parseRecommendation({ topConcepts: many }, ["기존1", "기존2"], []).topConcepts).toHaveLength(TOP_CONCEPTS_MAX_TOTAL - 2);
    expect(parseRecommendation({ topConcepts: many }, Array.from({ length: 10 }, (_, i) => `기존${i}`), []).topConcepts).toEqual([]);
  });
  it("너무 긴 이름, 빈 이름, 모양이 다른 값은 버리고 이유는 길면 자른다", () => {
    const r = parseRecommendation({ topConcepts: [{ name: "가".repeat(31) }, { name: "  " }, { name: 3 }, null, "x", { name: "정상", reason: "나".repeat(500) }] }, [], []);
    expect(r.topConcepts.map((c) => c.name)).toEqual(["정상"]);
    expect(Array.from(r.topConcepts[0].reason).length).toBe(120);
    expect(parseRecommendation("x", [], [])).toEqual({ topConcepts: [], projectTopics: [] });
  });
});

describe("checkApproved", () => {
  it("승인한 값에서 이미 있는 것은 빼고 돌려준다", () => {
    expect(checkApproved(["연구", "취업준비"], ["A", "a"], ["취업준비"], [])).toEqual({ ok: true, topConcepts: ["연구"], projectTopics: ["A"] });
  });
  it("상위 개념이 전체 10개를 넘으면 거절한다", () => {
    const r = checkApproved(["새1", "새2"], [], Array.from({ length: 9 }, (_, i) => `기존${i}`), []);
    expect(r).toMatchObject({ ok: false });
  });
  it("이름이 30자를 넘으면 거절한다", () => {
    expect(checkApproved(["가".repeat(31)], [], [], [])).toMatchObject({ ok: false });
  });
});
