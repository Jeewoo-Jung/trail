import { describe, expect, it } from "vitest";
import { FakeStore } from "./fake-store";
import { listCards } from "./list-cards";
import { recordCards } from "./record-cards";

const NOT_EXISTING_KEY = "11111111-1111-4111-8111-111111111111";

function storeWithConcepts(): FakeStore {
  const store = new FakeStore();
  store.concepts = {
    topConcepts: ["연구", "업무"],
    approvedSubConcepts: [{ top: "연구", name: "임베딩" }],
  };
  store.exclusions = { alwaysExcluded: ["비밀 주제"], blocked: ["개인 일기", "비밀주제"] };
  return store;
}

describe("listCards", () => {
  it("대화 키 없이 부르면 카드는 비어 있고, 개념과 제외 주제는 알려 준다", async () => {
    const outcome = await listCards(storeWithConcepts(), {});
    if (!outcome.ok) throw new Error("성공해야 함");
    expect(outcome.output).toEqual({
      conversationKey: null,
      cards: [],
      topConcepts: ["연구", "업무"],
      approvedSubConcepts: [{ top: "연구", name: "임베딩" }],
      excludedTopics: ["비밀 주제", "개인 일기"],
    });
  });

  it("입력이 아예 없어도(undefined) 처음 기록하는 것으로 본다", async () => {
    const outcome = await listCards(storeWithConcepts(), undefined);
    expect(outcome.ok).toBe(true);
  });

  it("기록한 뒤에는 이 대화의 카드를 id·주제 키·제목만으로 보여 준다", async () => {
    const store = storeWithConcepts();
    const recorded = await recordCards(store, {
      cards: [
        { topicKey: "a", title: "첫 카드", summary: "비밀요약", evidence: ["비밀근거"] },
        { topicKey: "b", title: "둘째 카드", summary: "x", evidence: ["y"] },
      ],
    });
    if (!recorded.ok) throw new Error("기록 실패");
    const outcome = await listCards(store, { conversationKey: recorded.output.conversationKey });
    if (!outcome.ok) throw new Error("성공해야 함");

    expect(outcome.output.cards.map((c) => [c.topicKey, c.title])).toEqual([
      ["a", "첫 카드"],
      ["b", "둘째 카드"],
    ]);
    expect(outcome.output.cards[0].id).toBe(recorded.output.results[0].cardId);
    const text = JSON.stringify(outcome.output);
    expect(text).not.toContain("비밀요약");
    expect(text).not.toContain("비밀근거");
  });

  it("다른 대화의 카드는 섞이지 않는다", async () => {
    const store = new FakeStore();
    const a = await recordCards(store, { cards: [{ topicKey: "a", title: "A", evidence: ["e"] }] });
    const b = await recordCards(store, { cards: [{ topicKey: "b", title: "B", evidence: ["e"] }] });
    if (!a.ok || !b.ok) throw new Error("기록 실패");
    const outcome = await listCards(store, { conversationKey: a.output.conversationKey });
    if (!outcome.ok) throw new Error("성공해야 함");
    expect(outcome.output.cards.map((c) => c.topicKey)).toEqual(["a"]);
  });

  it("없는 대화 키와 uuid가 아닌 대화 키는 거절한다", async () => {
    expect((await listCards(new FakeStore(), { conversationKey: NOT_EXISTING_KEY })).ok).toBe(false);
    expect((await listCards(new FakeStore(), { conversationKey: "abc" })).ok).toBe(false);
  });
});
