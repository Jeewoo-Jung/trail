import { describe, expect, it } from "vitest";
import { buildTree, cardsOfNode, classificationLabel, findNode, flattenNodes, nodeKey, pendingProposals, UNCLASSIFIED_KEY, type CardRow, type ConceptRow } from "./tree";

const k = (id: string, parentId: string | null, name: string, status: ConceptRow["status"] = "approved", sortOrder = 0): ConceptRow => ({ id, parentId, name, status, sortOrder });
const concepts: ConceptRow[] = [
  k("t2", null, "연구", "approved", 1),
  k("t1", null, "취업준비", "approved", 0),
  k("a", "t1", "인턴 활동"),
  k("b", "t1", "자기소개서", "proposed"),
  k("c", "t1", "면접", "rejected"),
  k("e", "t2", "임베딩"),
  k("e1", "e", "문장 임베딩"),
  k("e2", "e1", "소형 모델", "proposed"),
];
const card = (id: string, conceptId: string | null, extra: Partial<CardRow> = {}): CardRow => ({
  id, title: `카드${id}`, summary: "요약", keywords: [], evidence: ["근거"], candidates: [], conceptId, status: "done", createdAt: `2026-10-23T0${id}:00:00Z`, ...extra,
});

describe("buildTree", () => {
  it("뿌리는 정렬 번호 순이고, 개념 수·깊이가 5단계 트리로 이어진다", () => {
    const tree = buildTree([card("1", "a"), card("2", "a"), card("3", "e1"), card("4", "e2")], concepts);
    expect(tree.map((n) => [n.name, n.count])).toEqual([["취업준비", 2], ["연구", 2]]);
    const small = findNode(tree, nodeKey("e2"))!;
    expect(small.path).toEqual(["연구", "임베딩", "문장 임베딩", "소형 모델"]);
    expect(small.depth).toBe(4);
  });
  it("개념의 카드 수는 그 아래 모든 카드를 합친다", () => {
    const tree = buildTree([card("1", "e"), card("2", "e1"), card("3", "e2")], concepts);
    expect(findNode(tree, nodeKey("e"))!.count).toBe(3);
    expect(findNode(tree, nodeKey("e"))!.ownCards).toHaveLength(1);
    expect(findNode(tree, nodeKey("e1"))!.count).toBe(2);
  });
  it("승인된 개념은 카드가 없어도 보이고, 제안 중인 개념은 그 아래에 카드가 있을 때만 보인다", () => {
    const empty = buildTree([], concepts);
    expect(findNode(empty, nodeKey("a"))).not.toBeNull();
    expect(findNode(empty, nodeKey("b"))).toBeNull();
    expect(findNode(empty, nodeKey("e2"))).toBeNull();
    const withCard = buildTree([card("1", "b")], concepts);
    expect(findNode(withCard, nodeKey("b"))?.proposed).toBe(true);
  });
  it("거절된 개념은 보이지 않고, 거기 붙은 카드는 가장 가까운 남은 조상으로 올라간다", () => {
    const tree = buildTree([card("1", "c")], concepts);
    expect(findNode(tree, nodeKey("c"))).toBeNull();
    expect(findNode(tree, nodeKey("t1"))!.ownCards.map((x) => x.id)).toEqual(["1"]);
  });
  it("개념이 없는 카드(분류 중·대기 포함)와 사라진 개념의 카드는 미분류 노드에 모은다", () => {
    const tree = buildTree([card("1", null), card("2", null, { status: "pending" }), card("3", "없는개념")], concepts);
    const last = tree[tree.length - 1];
    expect(last.key).toBe(UNCLASSIFIED_KEY);
    expect(last.count).toBe(3);
    expect(last.children).toEqual([]);
  });
  it("카드는 뿌리부터의 경로를 갖고, 아래에 세부 개념이 있는 개념에 직접 붙은 카드는 '하위 미정'이다", () => {
    const tree = buildTree([card("1", "e"), card("2", "e1")], concepts);
    const own = findNode(tree, nodeKey("e"))!.ownCards[0];
    expect(own.path).toEqual(["연구", "임베딩"]);
    expect(own.subUndecided).toBe(true);
    expect(findNode(tree, nodeKey("e1"))!.ownCards[0].subUndecided).toBe(false); // 자식은 제안 중이지만 카드가 없어 숨겨진 상태
  });
  it("추정·근거 없음 표시를 계산한다", () => {
    const tree = buildTree([card("1", "a", { summary: "확실한 말. 아마 그럴 것이다(추정)", evidence: [] })], concepts);
    const c = findNode(tree, nodeKey("a"))!.ownCards[0];
    expect(c.hasEstimate).toBe(true);
    expect(c.noEvidence).toBe(true);
  });
  it("카드는 최근 것이 먼저 나온다", () => {
    const tree = buildTree([card("1", "a"), card("3", "a"), card("2", "a")], concepts);
    expect(findNode(tree, nodeKey("a"))!.ownCards.map((x) => x.id)).toEqual(["3", "2", "1"]);
  });
});

describe("cardsOfNode·flattenNodes", () => {
  const tree = buildTree([card("1", "a"), card("2", "b"), card("3", "e1"), card("4", null)], concepts);
  it("null이면 모든 카드, 뿌리를 누르면 그 아래 전부, 하위를 누르면 그 하위만", () => {
    expect(cardsOfNode(tree, null)).toHaveLength(4);
    expect(cardsOfNode(tree, nodeKey("t1")).map((c) => c.id).sort()).toEqual(["1", "2"]);
    expect(cardsOfNode(tree, nodeKey("a")).map((c) => c.id)).toEqual(["1"]);
    expect(cardsOfNode(tree, nodeKey("e")).map((c) => c.id)).toEqual(["3"]);
    expect(cardsOfNode(tree, "없는키")).toEqual([]);
  });
  it("모든 노드를 부모가 먼저 오는 순서로 펼친다", () => {
    const names = flattenNodes(tree).map((n) => n.name);
    expect(names.indexOf("임베딩")).toBeLessThan(names.indexOf("문장 임베딩"));
    expect(names).toContain("미분류");
  });
});

describe("pendingProposals", () => {
  it("제안 중인 가지는 맨 위 노드 하나만 올리고, 부모 경로·카드 수·그 아래 개념 수를 알려 준다", () => {
    const cs: ConceptRow[] = [...concepts, k("b1", "b", "경험 항목", "proposed")];
    const tree = buildTree([card("1", "b"), card("2", "b1"), card("3", "e2")], cs);
    const list = pendingProposals(tree);
    expect(list.map((p) => p.name)).toEqual(["자기소개서", "소형 모델"]); // 경험 항목은 자기소개서 가지에 포함되므로 따로 올리지 않는다
    expect(list[0]).toEqual({ conceptId: "b", name: "자기소개서", parentPath: ["취업준비"], cardCount: 2, descendantCount: 1 });
    expect(list[1].parentPath).toEqual(["연구", "임베딩", "문장 임베딩"]);
  });
  it("제안이 없으면 빈 배열", () => {
    expect(pendingProposals(buildTree([], concepts.filter((c) => c.status === "approved")))).toEqual([]);
  });
});

describe("classificationLabel", () => {
  it("경로를 한 줄로, 비어 있으면 미분류", () => {
    expect(classificationLabel(["연구", "임베딩"])).toBe("연구 > 임베딩");
    expect(classificationLabel([])).toBe("미분류");
  });
});
