import { describe, expect, it } from "vitest";
import { buildTree, cardsOfNode, type CardRow, type SubRow, type TopRow } from "./tree";

const tops: TopRow[] = [
  { id: "t2", name: "연구", sortOrder: 1 },
  { id: "t1", name: "취업준비", sortOrder: 0 },
];
const subs: SubRow[] = [
  { id: "s1", topId: "t1", name: "인턴 활동", status: "approved" },
  { id: "s2", topId: "t1", name: "자기소개서", status: "proposed" },
  { id: "s3", topId: "t1", name: "면접", status: "rejected" },
  { id: "s4", topId: "t2", name: "빈 승인 하위", status: "approved" },
  { id: "s5", topId: "t2", name: "빈 제안 하위", status: "proposed" },
];
const card = (id: string, extra: Partial<CardRow> = {}): CardRow => ({
  id, title: `카드${id}`, summary: "요약", keywords: [], evidence: ["근거"], candidates: [],
  topId: null, subId: null, status: "done", createdAt: `2026-10-23T0${id}:00:00Z`, ...extra,
});

describe("buildTree", () => {
  it("상위 개념은 정렬 번호 순이고 카드 수를 센다", () => {
    const tree = buildTree([card("1", { topId: "t1", subId: "s1" }), card("2", { topId: "t1", subId: "s1" })], tops, subs);
    expect(tree.map((t) => [t.name, t.count])).toEqual([["취업준비", 2], ["연구", 0]]);
  });
  it("카드 없는 승인 하위는 보이고, 카드 없는 제안 하위는 숨긴다", () => {
    const tree = buildTree([], tops, subs);
    expect(tree[1].subs.map((s) => s.name)).toEqual(["빈 승인 하위"]);
  });
  it("제안 중인 하위 개념은 '제안' 표시로 카드와 함께 보인다", () => {
    const tree = buildTree([card("1", { topId: "t1", subId: "s2" })], tops, subs);
    const sub = tree[0].subs.find((s) => s.name === "자기소개서");
    expect(sub).toMatchObject({ proposed: true });
    expect(sub?.cards).toHaveLength(1);
  });
  it("거절된 하위 개념의 카드는 하위 미정 아래로 간다", () => {
    const tree = buildTree([card("1", { topId: "t1", subId: "s3" })], tops, subs);
    const undecided = tree[0].subs.find((s) => s.undecided);
    expect(undecided?.cards.map((c) => c.id)).toEqual(["1"]);
    expect(undecided?.cards[0].subUndecided).toBe(true);
    expect(tree[0].subs.some((s) => s.name === "면접")).toBe(false);
  });
  it("상위 개념이 없는 카드(분류 중·대기 포함)는 미분류에 모은다", () => {
    const tree = buildTree([card("1"), card("2", { status: "pending" }), card("3", { status: "waiting" })], tops, subs);
    const last = tree[tree.length - 1];
    expect(last.name).toBe("미분류");
    expect(last.count).toBe(3);
  });
  it("분류가 끝나지 않은 카드는 하위 미정으로 보이지 않는다", () => {
    const tree = buildTree([card("1", { topId: "t1", status: "pending" })], tops, subs);
    expect(tree[0].subs.flatMap((s) => s.cards)[0].subUndecided).toBe(false);
  });
  it("추정·근거 없음 표시를 계산한다", () => {
    const tree = buildTree([card("1", { summary: "확실한 말. 아마 그럴 것이다(추정)", evidence: [] })], tops, subs);
    const c = tree[tree.length - 1].subs[0].cards[0];
    expect(c.hasEstimate).toBe(true);
    expect(c.noEvidence).toBe(true);
  });
  it("카드는 최근 것이 먼저 나온다", () => {
    const tree = buildTree([card("1"), card("3"), card("2")], tops, subs);
    expect(tree[tree.length - 1].subs[0].cards.map((c) => c.id)).toEqual(["3", "2", "1"]);
  });
  it("다른 상위 개념에 속한 하위 개념 id가 붙어 있어도 섞이지 않는다", () => {
    const tree = buildTree([card("1", { topId: "t2", subId: "s1" })], tops, subs);
    expect(tree.find((t) => t.name === "연구")?.subs.find((s) => s.undecided)?.cards).toHaveLength(1);
  });
});

describe("cardsOfNode", () => {
  const tree = buildTree([card("1", { topId: "t1", subId: "s1" }), card("2", { topId: "t1", subId: "s2" }), card("3")], tops, subs);
  it("null이면 모든 카드, 상위를 누르면 그 아래 전부, 하위를 누르면 그 하위만", () => {
    expect(cardsOfNode(tree, null)).toHaveLength(3);
    expect(cardsOfNode(tree, "top:t1").map((c) => c.id).sort()).toEqual(["1", "2"]);
    expect(cardsOfNode(tree, "sub:s1").map((c) => c.id)).toEqual(["1"]);
    expect(cardsOfNode(tree, "없는키")).toEqual([]);
  });
});
