import { describe, expect, it } from "vitest";
import { checkCard } from "../rules/card";
import { maskSecrets } from "../rules/mask-secrets";
import { buildTree, cardsOfNode, flattenNodes, pendingProposals } from "../rules/tree";
import { SAMPLE_CARDS, SAMPLE_CONCEPTS } from "./sample-data";

describe("가상 샘플 데이터", () => {
  it("카드가 약 20장이고 id가 겹치지 않는다", () => {
    expect(SAMPLE_CARDS.length).toBeGreaterThanOrEqual(18);
    expect(SAMPLE_CARDS.length).toBeLessThanOrEqual(22);
    expect(new Set(SAMPLE_CARDS.map((c) => c.id)).size).toBe(SAMPLE_CARDS.length);
  });
  it("모든 카드가 실제 카드와 같은 한도 검사를 통과한다", () => {
    for (const card of SAMPLE_CARDS) {
      const result = checkCard({ topicKey: card.id, title: card.title, summary: card.summary, keywords: card.keywords, evidence: card.evidence });
      expect(result.ok, card.title).toBe(true);
    }
  });
  it("비밀값처럼 보이는 글자가 없다", () => {
    const text = JSON.stringify([SAMPLE_CARDS, SAMPLE_CONCEPTS]);
    expect(maskSecrets(text).text).toBe(text);
  });
  it("가리키는 개념이 모두 존재하고, 개념 id가 겹치지 않는다", () => {
    const ids = new Set(SAMPLE_CONCEPTS.map((c) => c.id));
    expect(ids.size).toBe(SAMPLE_CONCEPTS.length);
    for (const c of SAMPLE_CONCEPTS) if (c.parentId) expect(ids.has(c.parentId)).toBe(true);
    for (const card of SAMPLE_CARDS) if (card.conceptId) expect(ids.has(card.conceptId)).toBe(true);
  });
  it("트리가 3단계까지 이어지고, 화면에 보이는 모든 경우(제안·하위 미정·분류 중·대기·추정·근거 없음·미분류)가 들어 있다", () => {
    const tree = buildTree(SAMPLE_CARDS, SAMPLE_CONCEPTS);
    const nodes = flattenNodes(tree);
    const cards = cardsOfNode(tree, null);
    expect(cards).toHaveLength(SAMPLE_CARDS.length);
    expect(Math.max(...nodes.map((n) => n.depth))).toBe(3);
    expect(pendingProposals(tree).length).toBeGreaterThan(0);
    expect(cards.some((c) => c.subUndecided)).toBe(true);
    expect(cards.some((c) => c.status === "pending")).toBe(true);
    expect(cards.some((c) => c.status === "waiting")).toBe(true);
    expect(cards.some((c) => c.hasEstimate)).toBe(true);
    expect(cards.some((c) => c.noEvidence && c.status === "done")).toBe(true);
    expect(tree.some((n) => n.name === "미분류")).toBe(true);
  });
});
