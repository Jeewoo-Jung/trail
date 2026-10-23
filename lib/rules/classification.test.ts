import { describe, expect, it } from "vitest";
import { decideClassification, type SubConceptRef, type TopConceptRef } from "./classification";

const tops: TopConceptRef[] = [
  { id: "t1", name: "취업준비" },
  { id: "t2", name: "연구" },
];
const subs: SubConceptRef[] = [
  { id: "s1", topId: "t1", name: "정부 부처 인턴 활동", status: "approved" },
  { id: "s2", topId: "t1", name: "자기소개서", status: "proposed" },
  { id: "s3", topId: "t1", name: "면접", status: "rejected" },
];

describe("decideClassification", () => {
  it("'상위 > 하위' 모양으로 답해도 하위 이름만 쓴다", () => {
    expect(decideClassification({ top: "취업준비", sub: "취업준비 > 정부 부처 인턴 활동" }, tops, subs)?.sub).toEqual({ kind: "existing", id: "s1" });
  });
  it("승인된 하위 개념은 공백·대소문자 달라도 그대로 쓴다", () => {
    expect(decideClassification({ top: "취업 준비", sub: "정부 부처인턴활동" }, tops, subs)).toEqual({ topId: "t1", sub: { kind: "existing", id: "s1" } });
  });
  it("제안 중인 하위 개념은 중복 제안하지 않고 그 항목을 쓴다", () => {
    expect(decideClassification({ top: "취업준비", sub: "자기소개서" }, tops, subs)?.sub).toEqual({ kind: "existing", id: "s2" });
  });
  it("거절한 하위 개념은 다시 제안하지 않고 하위 미정으로 둔다", () => {
    expect(decideClassification({ top: "취업준비", sub: "면접" }, tops, subs)).toEqual({ topId: "t1", sub: null });
  });
  it("같은 이름이라도 다른 상위 개념 아래에서는 새 제안이다", () => {
    expect(decideClassification({ top: "연구", sub: "면접" }, tops, subs)).toEqual({ topId: "t2", sub: { kind: "propose", name: "면접" } });
  });
  it("없는 하위 개념은 신규 제안으로 올린다", () => {
    expect(decideClassification({ top: "연구", sub: "임베딩" }, tops, subs)?.sub).toEqual({ kind: "propose", name: "임베딩" });
  });
  it("너무 긴 하위 개념 이름은 제안하지 않는다", () => {
    expect(decideClassification({ top: "연구", sub: "가".repeat(31) }, tops, subs)).toEqual({ topId: "t2", sub: null });
  });
  it("상위 개념이 목록 밖이면 거부(null)한다 — 새 상위 개념을 만들지 않는다", () => {
    expect(decideClassification({ top: "요리", sub: "x" }, tops, subs)).toBeNull();
  });
  it("미분류는 상위·하위 모두 비운다", () => {
    expect(decideClassification({ top: "미분류", sub: "아무거나" }, tops, subs)).toEqual({ topId: null, sub: null });
  });
  it("하위가 비어 있거나 null이면 하위 미정", () => {
    expect(decideClassification({ top: "연구" }, tops, subs)).toEqual({ topId: "t2", sub: null });
    expect(decideClassification({ top: "연구", sub: null }, tops, subs)).toEqual({ topId: "t2", sub: null });
  });
  it("모양이 다른 출력은 거부한다", () => {
    for (const bad of [null, "text", 3, {}, { top: 1 }, { top: "연구", sub: 5 }]) expect(decideClassification(bad, tops, subs)).toBeNull();
  });
});
