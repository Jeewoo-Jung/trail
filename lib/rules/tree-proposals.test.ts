import { describe, expect, it } from "vitest";
import { describeProposal, hasProposalCandidates, mergeSignature, parseAdvice, PROPOSALS_MAX, splitSignature, type ConceptContext } from "./tree-proposals";

const node = (id: string, parentId: string | null, name: string, o: { n?: number; status?: ConceptContext["status"]; depth?: number; childCount?: number; childNames?: string[] } = {}): ConceptContext => ({
  id, parentId, name, path: [name], status: o.status ?? "approved", depth: o.depth ?? (parentId === null ? 1 : 2), childCount: o.childCount ?? 0,
  childNames: o.childNames ?? [], cards: Array.from({ length: o.n ?? 0 }, (_, i) => ({ id: `${id}-c${i}`, title: `카드${i}` })),
});
// 연구(뿌리) 아래 임베딩(카드 5장)·벡터 표현(1장), 업무(뿌리) 아래 회의, 그리고 거절된 개념
const concepts = [
  node("r1", null, "연구", { childCount: 2 }),
  node("a", "r1", "임베딩", { n: 5, childNames: ["기존 자식", "거절된 자식"] }),
  node("b", "r1", "벡터 표현", { n: 1 }),
  node("r2", null, "업무", { childCount: 1 }),
  node("c", "r2", "회의", { n: 1 }),
  node("d", "r1", "거절됨", { status: "rejected" }),
];
const none = new Set<string>();

describe("parseAdvice 병합", () => {
  it("같은 부모 아래 형제인 두 잎 개념의 병합을 받는다", () => {
    const r = parseAdvice({ merges: [{ from: "b", into: "a" }] }, concepts, none);
    expect(r).toEqual([{ kind: "merge", parentId: "r1", signature: mergeSignature("a", "b"), payload: { fromId: "b", intoId: "a", fromName: "벡터 표현", intoName: "임베딩" } }]);
  });
  it("뿌리끼리의 병합도 받는다(부모가 null인 형제)", () => {
    const r = parseAdvice({ merges: [{ from: "r2", into: "r1" }] }, [node("r1", null, "연구"), node("r2", null, "업무")], none);
    expect(r[0]).toMatchObject({ kind: "merge", parentId: null });
  });
  it("부모가 다른 개념끼리, 자식이 있는 개념을 없애는 병합, 같은 것끼리, 없는 id, 거절된 개념은 버린다", () => {
    const merges = [{ from: "b", into: "c" }, { from: "r1", into: "r2" }, { from: "a", into: "a" }, { from: "zzz", into: "a" }, { from: "d", into: "a" }, { from: "a" }, null, "x"];
    expect(parseAdvice({ merges }, concepts, none)).toEqual([]);
  });
  it("방향이 반대여도 같은 제안으로 보고 한 번만 받는다", () => {
    expect(parseAdvice({ merges: [{ from: "b", into: "a" }, { from: "a", into: "b" }] }, concepts, none)).toHaveLength(1);
  });
  it("이미 만든(거절한 것 포함) 제안은 다시 만들지 않는다", () => {
    expect(parseAdvice({ merges: [{ from: "b", into: "a" }] }, concepts, new Set([mergeSignature("a", "b")]))).toEqual([]);
  });
});

describe("parseAdvice 분리", () => {
  const good = { splits: [{ sub: "a", parts: [{ name: "문장 임베딩", cards: ["a-c0", "a-c1"] }, { name: "이미지 임베딩", cards: ["a-c2"] }] }] };
  it("카드가 충분한 개념의 분리를 받고, 새 개념은 그 개념 아래에 만든다", () => {
    const [p] = parseAdvice(good, concepts, none);
    expect(p).toMatchObject({ kind: "split", parentId: "r1", signature: splitSignature("a"), payload: { subId: "a", parts: [{ name: "문장 임베딩", cardIds: ["a-c0", "a-c1"] }, { name: "이미지 임베딩", cardIds: ["a-c2"] }] } });
  });
  it("카드가 적은 개념은 나누지 않는다", () => {
    expect(parseAdvice({ splits: [{ sub: "b", parts: good.splits[0].parts }] }, concepts, none)).toEqual([]);
  });
  it("가장 깊은 단계(5단계)의 개념은 더 나눌 수 없다", () => {
    const deep = [node("z", "p", "깊은", { n: 5, depth: 5 })];
    expect(parseAdvice({ splits: [{ sub: "z", parts: good.splits[0].parts.map((x) => ({ ...x, cards: x.cards.map((c) => c.replace("a-", "z-")) })) }] }, deep, none)).toEqual([]);
  });
  it("그 개념에 없는 카드, 두 곳에 넣은 카드, 빈 부분은 버린다", () => {
    const bad = (parts: unknown) => parseAdvice({ splits: [{ sub: "a", parts }] }, concepts, none);
    expect(bad([{ name: "X", cards: ["남의카드"] }, { name: "Y", cards: ["a-c0"] }])).toEqual([]);
    expect(bad([{ name: "X", cards: ["a-c0"] }, { name: "Y", cards: ["a-c0"] }])).toEqual([]);
    expect(bad([{ name: "X", cards: [] }, { name: "Y", cards: ["a-c0"] }])).toEqual([]);
  });
  it("부분이 1개거나 4개면 버린다", () => {
    const p = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `새${i}`, cards: [`a-c${i}`] }));
    expect(parseAdvice({ splits: [{ sub: "a", parts: p(1) }] }, concepts, none)).toEqual([]);
    expect(parseAdvice({ splits: [{ sub: "a", parts: p(4) }] }, concepts, none)).toEqual([]);
    expect(parseAdvice({ splits: [{ sub: "a", parts: p(3) }] }, concepts, none)).toHaveLength(1);
  });
  it("그 개념 아래에 이미 있는 이름(거절된 것 포함), 중복 이름, 너무 긴 이름은 버린다", () => {
    const named = (a: string, b: string) => parseAdvice({ splits: [{ sub: "a", parts: [{ name: a, cards: ["a-c0"] }, { name: b, cards: ["a-c1"] }] }] }, concepts, none);
    expect(named("기존자식", "새로움")).toEqual([]);
    expect(named("거절된 자식", "새로움")).toEqual([]);
    expect(named("같은 이름", "같은이름")).toEqual([]);
    expect(named("가".repeat(31), "새로움")).toEqual([]);
    expect(named("새1", "새2")).toHaveLength(1); // 형제(벡터 표현)와 겹치는 이름은 상관없다 — 새 개념은 임베딩 "아래"에 생기기 때문이다
  });
});

describe("그 밖의 규칙", () => {
  it("제안은 최대 3개까지", () => {
    const many = [node("p", null, "P"), ...["A", "B", "C", "D", "E"].map((x) => node(x.toLowerCase(), "p", x))];
    const merges = [{ from: "b", into: "a" }, { from: "c", into: "a" }, { from: "d", into: "a" }, { from: "e", into: "a" }];
    expect(parseAdvice({ merges }, many, none)).toHaveLength(PROPOSALS_MAX);
  });
  it("모양이 다른 출력은 빈 목록", () => {
    for (const raw of [null, undefined, "x", 1, [], { merges: "x", splits: 3 }]) expect(parseAdvice(raw, concepts, none)).toEqual([]);
  });
  it("제안할 거리가 없으면 Claude를 부르지 않는다", () => {
    expect(hasProposalCandidates([node("a", null, "A", { n: 3 })])).toBe(false);
    expect(hasProposalCandidates([node("a", "p", "A", { n: 3 }), node("b", "q", "B", { n: 1 })])).toBe(false); // 부모가 다른 외톨이들
    expect(hasProposalCandidates([node("a", "p", "A"), node("b", "p", "B")])).toBe(true);
    expect(hasProposalCandidates([node("a", null, "A", { n: 4 })])).toBe(true);
    expect(hasProposalCandidates([node("a", "p", "A"), node("b", "p", "B", { status: "proposed" })])).toBe(false);
    expect(hasProposalCandidates([node("a", "p", "A", { n: 9, depth: 5 })])).toBe(false);
  });
  it("설명 문장에 이름과 카드 수가 들어간다", () => {
    expect(describeProposal({ kind: "merge", payload: { fromId: "b", intoId: "a", fromName: "벡터", intoName: "임베딩" } })).toContain("“벡터”을(를) “임베딩”에 합칩니다");
    const text = describeProposal({ kind: "split", payload: { subId: "a", subName: "임베딩", parts: [{ name: "문장", cardIds: ["1", "2"] }, { name: "이미지", cardIds: ["3"] }] } });
    expect(text).toContain("“임베딩” 아래에");
    expect(text).toContain("“문장”(2장), “이미지”(1장)");
  });
});
