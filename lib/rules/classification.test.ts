import { describe, expect, it } from "vitest";
import { extractPath, listConceptPaths, resolveClassification, type ConceptRef } from "./classification";
import { CONCEPT_LIMITS } from "./limits";

const c = (id: string, parentId: string | null, name: string, status: ConceptRef["status"] = "approved"): ConceptRef => ({ id, parentId, name, status });
const concepts: ConceptRef[] = [
  c("a", null, "취업준비"),
  c("a1", "a", "재경부 인턴 활동"),
  c("a2", "a", "자기소개서", "proposed"),
  c("a3", "a", "면접", "rejected"),
  c("b", null, "연구"),
  c("b1", "b", "임베딩"),
  c("b1x", "b1", "문장 임베딩"),
];

describe("extractPath", () => {
  it("path 배열과 옛 모양({ top, sub })을 모두 받는다", () => {
    expect(extractPath({ path: [" 연구 ", "임베딩"] })).toEqual(["연구", "임베딩"]);
    expect(extractPath({ top: "연구", sub: "임베딩" })).toEqual(["연구", "임베딩"]);
    expect(extractPath({ top: "연구", sub: null })).toEqual(["연구"]);
    expect(extractPath({ top: "연구" })).toEqual(["연구"]);
  });
  it("빈 이름은 버리고, 모양이 다르면 null", () => {
    expect(extractPath({ path: ["연구", "  ", ""] })).toEqual(["연구"]);
    for (const bad of [null, "x", 3, {}, { path: [1] }, { path: "연구" }, { top: 3 }]) expect(extractPath(bad)).toBeNull();
  });
});

describe("resolveClassification: 기존 개념", () => {
  it("뿌리부터 따라 내려가 가장 깊은 기존 개념에 붙인다(공백·대소문자 무시)", () => {
    expect(resolveClassification({ path: ["취업 준비", "재경부인턴활동"] }, concepts)).toEqual({ existingId: "a1", create: [] });
    expect(resolveClassification({ path: ["연구", "임베딩", "문장 임베딩"] }, concepts)).toEqual({ existingId: "b1x", create: [] });
    expect(resolveClassification({ path: ["연구"] }, concepts)).toEqual({ existingId: "b", create: [] });
  });
  it("제안 중인 개념도 그대로 쓴다(중복 제안하지 않는다)", () => {
    expect(resolveClassification({ path: ["취업준비", "자기소개서"] }, concepts)).toEqual({ existingId: "a2", create: [] });
  });
  it("거절한 개념은 다시 만들지 않고 그 부모에 붙인다", () => {
    expect(resolveClassification({ path: ["취업준비", "면접"] }, concepts)).toEqual({ existingId: "a", create: [] });
    expect(resolveClassification({ path: ["취업준비", "면접", "모의면접"] }, concepts)).toEqual({ existingId: "a", create: [] });
  });
});

describe("resolveClassification: 새 개념", () => {
  it("새 상위 개념(뿌리)도 만든다", () => {
    expect(resolveClassification({ path: ["건강"] }, concepts)).toEqual({ existingId: null, create: ["건강"] });
    expect(resolveClassification({ path: ["건강", "운동", "달리기"] }, concepts)).toEqual({ existingId: null, create: ["건강", "운동", "달리기"] });
  });
  it("있는 부분까지는 따라가고 없는 이름부터 새로 만든다", () => {
    expect(resolveClassification({ path: ["연구", "평가", "정답 세트"] }, concepts)).toEqual({ existingId: "b", create: ["평가", "정답 세트"] });
    expect(resolveClassification({ path: ["연구", "임베딩", "문장 임베딩", "소형 모델"] }, concepts)).toEqual({ existingId: "b1x", create: ["소형 모델"] });
  });
  it("옛 모양({ top, sub })으로도 새 개념을 만든다", () => {
    expect(resolveClassification({ top: "연구", sub: "평가" }, concepts)).toEqual({ existingId: "b", create: ["평가"] });
  });
});

describe("resolveClassification: 한도와 미분류", () => {
  it("5단계를 넘는 경로는 5단계까지만 쓴다", () => {
    const r = resolveClassification({ path: ["가", "나", "다", "라", "마", "바", "사"] }, []);
    expect(r.create).toEqual(["가", "나", "다", "라", "마"]);
    expect(r.create).toHaveLength(CONCEPT_LIMITS.maxDepth);
  });
  it("이름이 30자를 넘으면 그 앞까지만 쓴다", () => {
    expect(resolveClassification({ path: ["연구", "가".repeat(31)] }, concepts)).toEqual({ existingId: "b", create: [] });
    expect(resolveClassification({ path: ["가".repeat(31)] }, concepts)).toEqual({ existingId: null, create: [] });
    expect(resolveClassification({ path: ["가".repeat(30)] }, concepts).create).toHaveLength(1);
  });
  it("개념 전체가 한도에 닿으면 새로 만들지 않고 찾은 곳까지만 붙인다", () => {
    const many = Array.from({ length: CONCEPT_LIMITS.maxTotal }, (_, i) => c(`x${i}`, null, `개념${i}`));
    expect(resolveClassification({ path: ["새개념"] }, many)).toEqual({ existingId: null, create: [] });
    expect(resolveClassification({ path: ["개념3", "새 하위"] }, many)).toEqual({ existingId: "x3", create: [] });
  });
  it("미분류·빈 경로·모양이 다른 값은 미분류", () => {
    for (const raw of [{ path: ["미분류"] }, { top: "미분류" }, { path: [] }, { path: ["", " "] }, null, "엉뚱", 5, {}]) {
      expect(resolveClassification(raw, concepts)).toEqual({ existingId: null, create: [] });
    }
  });
});

describe("listConceptPaths", () => {
  it("거절된 개념과 그 아래를 빼고, 부모가 앞에 오는 순서로 경로를 만든다", () => {
    const list = listConceptPaths([...concepts, c("a3x", "a3", "모의면접")]);
    expect(list.map((p) => p.path.join(" > "))).toEqual([
      "연구", "연구 > 임베딩", "연구 > 임베딩 > 문장 임베딩",
      "취업준비", "취업준비 > 자기소개서", "취업준비 > 재경부 인턴 활동",
    ]);
    expect(list.find((p) => p.path.join() === "취업준비,자기소개서")?.status).toBe("proposed");
  });
});
