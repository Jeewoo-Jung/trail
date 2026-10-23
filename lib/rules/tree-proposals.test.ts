import { describe, expect, it } from "vitest";
import { describeProposal, hasProposalCandidates, mergeSignature, parseAdvice, PROPOSALS_MAX, splitSignature, type SubContext } from "./tree-proposals";

const card = (id: string) => ({ id, title: `카드${id}` });
const sub = (id: string, topId: string, name: string, n = 0, status: SubContext["status"] = "approved"): SubContext => ({
  id, topId, topName: topId === "t1" ? "연구" : "업무", name, status, cards: Array.from({ length: n }, (_, i) => card(`${id}-c${i}`)),
});
const subs = [sub("a", "t1", "임베딩", 5), sub("b", "t1", "벡터 표현", 1), sub("c", "t2", "회의", 1), sub("d", "t1", "거절됨", 0, "rejected")];
const none = new Set<string>();

describe("parseAdvice 병합", () => {
  it("같은 상위 개념의 두 하위 개념 병합을 받는다", () => {
    const r = parseAdvice({ merges: [{ from: "b", into: "a" }] }, subs, none);
    expect(r).toEqual([{ kind: "merge", topId: "t1", signature: mergeSignature("a", "b"), payload: { fromId: "b", intoId: "a", fromName: "벡터 표현", intoName: "임베딩" } }]);
  });
  it("다른 상위 개념끼리, 같은 것끼리, 없는 id, 거절된 하위 개념은 버린다", () => {
    const merges = [{ from: "b", into: "c" }, { from: "a", into: "a" }, { from: "zzz", into: "a" }, { from: "d", into: "a" }, { from: "a" }, null, "x"];
    expect(parseAdvice({ merges }, subs, none)).toEqual([]);
  });
  it("방향이 반대여도 같은 제안으로 보고 한 번만 받는다", () => {
    const r = parseAdvice({ merges: [{ from: "b", into: "a" }, { from: "a", into: "b" }] }, subs, none);
    expect(r).toHaveLength(1);
  });
  it("이미 만든(거절한 것 포함) 제안은 다시 만들지 않는다", () => {
    expect(parseAdvice({ merges: [{ from: "b", into: "a" }] }, subs, new Set([mergeSignature("a", "b")]))).toEqual([]);
  });
});

describe("parseAdvice 분리", () => {
  const good = { splits: [{ sub: "a", parts: [{ name: "문장 임베딩", cards: ["a-c0", "a-c1"] }, { name: "이미지 임베딩", cards: ["a-c2"] }] }] };
  it("카드가 충분한 하위 개념의 분리를 받는다", () => {
    const [p] = parseAdvice(good, subs, none);
    expect(p).toMatchObject({ kind: "split", signature: splitSignature("a"), payload: { subId: "a", parts: [{ name: "문장 임베딩", cardIds: ["a-c0", "a-c1"] }, { name: "이미지 임베딩", cardIds: ["a-c2"] }] } });
  });
  it("카드가 적은 하위 개념은 나누지 않는다", () => {
    expect(parseAdvice({ splits: [{ sub: "b", parts: good.splits[0].parts }] }, subs, none)).toEqual([]);
  });
  it("그 하위 개념에 없는 카드, 두 곳에 넣은 카드, 빈 부분은 버린다", () => {
    const bad = (parts: unknown) => parseAdvice({ splits: [{ sub: "a", parts }] }, subs, none);
    expect(bad([{ name: "X", cards: ["남의카드"] }, { name: "Y", cards: ["a-c0"] }])).toEqual([]);
    expect(bad([{ name: "X", cards: ["a-c0"] }, { name: "Y", cards: ["a-c0"] }])).toEqual([]);
    expect(bad([{ name: "X", cards: [] }, { name: "Y", cards: ["a-c0"] }])).toEqual([]);
  });
  it("부분이 1개거나 4개면 버린다", () => {
    const p = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `새${i}`, cards: [`a-c${i}`] }));
    expect(parseAdvice({ splits: [{ sub: "a", parts: p(1) }] }, subs, none)).toEqual([]);
    expect(parseAdvice({ splits: [{ sub: "a", parts: p(4) }] }, subs, none)).toEqual([]);
    expect(parseAdvice({ splits: [{ sub: "a", parts: p(3) }] }, subs, none)).toHaveLength(1);
  });
  it("이미 있는 이름(원래 이름, 다른 하위, 거절된 이름), 중복 이름, 너무 긴 이름은 버린다", () => {
    const named = (a: string, b: string) => parseAdvice({ splits: [{ sub: "a", parts: [{ name: a, cards: ["a-c0"] }, { name: b, cards: ["a-c1"] }] }] }, subs, none);
    expect(named("임베딩", "새로움")).toEqual([]);
    expect(named("벡터표현", "새로움")).toEqual([]);
    expect(named("거절됨", "새로움")).toEqual([]);
    expect(named("같은 이름", "같은이름")).toEqual([]);
    expect(named("가".repeat(31), "새로움")).toEqual([]);
  });
});

describe("그 밖의 규칙", () => {
  it("제안은 최대 3개까지", () => {
    const many = [sub("a", "t1", "A"), sub("b", "t1", "B"), sub("c", "t1", "C"), sub("d", "t1", "D"), sub("e", "t1", "E")];
    const merges = [{ from: "b", into: "a" }, { from: "c", into: "a" }, { from: "d", into: "a" }, { from: "e", into: "a" }];
    expect(parseAdvice({ merges }, many, none)).toHaveLength(PROPOSALS_MAX);
  });
  it("모양이 다른 출력은 빈 목록", () => {
    for (const raw of [null, undefined, "x", 1, [], { merges: "x", splits: 3 }]) expect(parseAdvice(raw, subs, none)).toEqual([]);
  });
  it("제안할 거리가 없으면 Claude를 부르지 않는다", () => {
    expect(hasProposalCandidates([sub("a", "t1", "A", 3)])).toBe(false);
    expect(hasProposalCandidates([sub("a", "t1", "A", 3), sub("b", "t2", "B", 1)])).toBe(false);
    expect(hasProposalCandidates([sub("a", "t1", "A"), sub("b", "t1", "B")])).toBe(true);
    expect(hasProposalCandidates([sub("a", "t1", "A", 4)])).toBe(true);
    expect(hasProposalCandidates([sub("a", "t1", "A"), sub("b", "t1", "B", 0, "proposed")])).toBe(false);
  });
  it("설명 문장에 이름과 카드 수가 들어간다", () => {
    expect(describeProposal({ kind: "merge", payload: { fromId: "b", intoId: "a", fromName: "벡터", intoName: "임베딩" } })).toContain("“벡터”을(를) “임베딩”에 합칩니다");
    expect(describeProposal({ kind: "split", payload: { subId: "a", subName: "임베딩", parts: [{ name: "문장", cardIds: ["1", "2"] }, { name: "이미지", cardIds: ["3"] }] } })).toContain("“문장”(2장), “이미지”(1장)");
  });
});
