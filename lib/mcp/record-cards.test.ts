import { describe, expect, it } from "vitest";
import { CARDS_PER_CONVERSATION_MAX } from "../rules/limits";
import { FakeStore } from "./fake-store";
import { recordCards, type RecordOutput } from "./record-cards";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOT_EXISTING_KEY = "11111111-1111-4111-8111-111111111111";

const card = (topicKey: string, extra: Record<string, unknown> = {}) => ({
  topicKey,
  title: `제목-${topicKey}`,
  summary: "요약",
  evidence: ["근거"],
  ...extra,
});

async function ok(store: FakeStore, input: unknown): Promise<RecordOutput> {
  const outcome = await recordCards(store, input);
  if (!outcome.ok) throw new Error(`성공해야 하는 요청이 거절됨: ${outcome.errors.join(" / ")}`);
  return outcome.output;
}

describe("새 대화에 기록", () => {
  it("대화 키 없이 보내면 새 키를 발급하고 카드마다 결과를 돌려준다", async () => {
    const store = new FakeStore();
    const out = await ok(store, { cards: [card("a"), card("b")] });

    expect(out.conversationKey).toMatch(UUID_V4);
    expect(out.results.map((r) => [r.topicKey, r.status])).toEqual([
      ["a", "created"],
      ["b", "created"],
    ]);
    expect(out.results.every((r) => typeof r.cardId === "string")).toBe(true);
    expect(store.cards.size).toBe(2);
  });

  it("결과에는 카드의 제목·요약·근거를 다시 싣지 않는다", async () => {
    const out = await ok(new FakeStore(), { cards: [card("a")] });
    const text = JSON.stringify(out);
    expect(text).not.toContain("제목-a");
    expect(text).not.toContain("요약");
    expect(text).not.toContain("근거");
  });

  it("카드가 하나도 없어도 대화 키는 발급한다", async () => {
    const out = await ok(new FakeStore(), { cards: [] });
    expect(out.conversationKey).toMatch(UUID_V4);
    expect(out.results).toEqual([]);
  });
});

describe("일부만 거절", () => {
  it("잘못된 카드는 이유와 함께 거절하고 나머지는 저장한다", async () => {
    const store = new FakeStore();
    const out = await ok(store, { cards: [card("a"), { topicKey: "x" }, card("c")] });
    expect(out.results.map((r) => r.status)).toEqual(["created", "rejected", "created"]);
    expect(out.results[1].topicKey).toBe("x");
    expect(out.results[1].reasons?.length).toBeGreaterThan(0);
    expect(store.cards.size).toBe(2);
  });

  it("카드 모양이 아예 아니면 주제 키 없이 거절한다", async () => {
    const out = await ok(new FakeStore(), { cards: [null, "카드", 123] });
    expect(out.results.map((r) => [r.topicKey, r.status])).toEqual([
      [null, "rejected"],
      [null, "rejected"],
      [null, "rejected"],
    ]);
  });

  it("한도를 넘은 카드는 숫자로 이유를 알려 주고 카드 내용은 넣지 않는다", async () => {
    const out = await ok(new FakeStore(), { cards: [card("a", { summary: "비밀문장" + "가".repeat(600) })] });
    expect(out.results[0].status).toBe("rejected");
    expect(out.results[0].reasons?.join(" ")).toContain("500자");
    expect(JSON.stringify(out)).not.toContain("비밀문장");
  });
});

describe("가리기와 근거 없음", () => {
  it("키 모양 문자열은 가려서 저장하고 알려 준다", async () => {
    const store = new FakeStore();
    const key = "sk-" + "aB3dE5fG7hJ9kL2mN4pQ6rS8".repeat(2);
    const out = await ok(store, { cards: [card("a", { summary: `키는 ${key}` })] });
    const saved = [...store.cards.values()][0];
    expect(saved.summary).toBe("키는 ●●●");
    expect(out.results[0].notes?.join(" ")).toContain("1곳");
    expect(JSON.stringify(out)).not.toContain(key);
  });

  it("근거가 없으면 요약을 비워서 저장하고 알려 준다", async () => {
    const store = new FakeStore();
    const out = await ok(store, { cards: [card("a", { evidence: [] })] });
    expect([...store.cards.values()][0].summary).toBe("");
    expect(out.results[0].status).toBe("created");
    expect(out.results[0].notes?.join(" ")).toContain("요약을 비우고");
  });
});

describe("같은 주제 찾기", () => {
  it("같은 호출 안에서 같은 주제가 두 번 오면 두 번째는 갱신이다", async () => {
    const store = new FakeStore();
    const out = await ok(store, { cards: [card("a"), card("a", { title: "고친 제목" })] });
    expect(out.results.map((r) => r.status)).toEqual(["created", "updated"]);
    expect(store.cards.size).toBe(1);
    expect([...store.cards.values()][0].title).toBe("고친 제목");
    expect(out.results[1].cardId).toBe(out.results[0].cardId);
  });

  it("같은 대화 키로 다시 보내면 같은 카드를 갱신한다", async () => {
    const store = new FakeStore();
    const first = await ok(store, { cards: [card("a")] });
    const second = await ok(store, { conversationKey: first.conversationKey, cards: [card("a", { title: "바뀜" })] });
    expect(second.conversationKey).toBe(first.conversationKey);
    expect(second.results[0]).toMatchObject({ status: "updated", cardId: first.results[0].cardId });
    expect(store.cards.size).toBe(1);
    expect(store.updateCalls).toBe(1);
  });

  it("내용이 같으면 쓰지 않고 알려 준다", async () => {
    const store = new FakeStore();
    const first = await ok(store, { cards: [card("a")] });
    const second = await ok(store, { conversationKey: first.conversationKey, cards: [card("a")] });
    expect(second.results[0].status).toBe("updated");
    expect(second.results[0].notes?.join(" ")).toContain("바뀐 내용이 없어");
    expect(store.updateCalls).toBe(0);
  });

  it("카드 id로도 갱신할 수 있다", async () => {
    const store = new FakeStore();
    const first = await ok(store, { cards: [card("a")] });
    const id = first.results[0].cardId!;
    const out = await ok(store, { conversationKey: first.conversationKey, cards: [card("a", { cardId: id, title: "id로 고침" })] });
    expect(out.results[0]).toMatchObject({ status: "updated", cardId: id });
    expect(store.cards.get(id)?.title).toBe("id로 고침");
  });

  it("카드 id가 있는데 찾지 못하면 새로 만들지 않고 거절한다", async () => {
    const store = new FakeStore();
    const first = await ok(store, { cards: [card("a")] });
    const out = await ok(store, { conversationKey: first.conversationKey, cards: [card("b", { cardId: "없는-id" })] });
    expect(out.results[0].status).toBe("rejected");
    expect(store.cards.size).toBe(1);
  });

  it("다른 대화의 카드 id는 고치지 못한다", async () => {
    const store = new FakeStore();
    const other = await ok(store, { cards: [card("a")] });
    const mine = await ok(store, { cards: [card("z")] });
    const out = await ok(store, {
      conversationKey: mine.conversationKey,
      cards: [card("z", { cardId: other.results[0].cardId, title: "가로챔" })],
    });
    expect(out.results[0].status).toBe("rejected");
    expect(out.results[0].reasons?.join(" ")).toContain("다른 대화");
    expect(store.cards.get(other.results[0].cardId!)?.title).toBe("제목-a");
  });

  it("카드 id의 주제 키를 다른 카드가 이미 쓰고 있으면 거절한다", async () => {
    const store = new FakeStore();
    const first = await ok(store, { cards: [card("a"), card("b")] });
    const out = await ok(store, {
      conversationKey: first.conversationKey,
      cards: [card("a", { cardId: first.results[1].cardId })],
    });
    expect(out.results[0].status).toBe("rejected");
    expect(out.results[0].reasons?.join(" ")).toContain("같은 주제 키");
  });
});

describe("대화당 10장", () => {
  it("한 번에 12장을 보내면 10장만 저장하고 나머지는 거절한다", async () => {
    const store = new FakeStore();
    const cards = Array.from({ length: 12 }, (_, i) => card(`t${i}`));
    const out = await ok(store, { cards });
    expect(out.results.filter((r) => r.status === "created")).toHaveLength(CARDS_PER_CONVERSATION_MAX);
    const rejected = out.results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reasons?.join(" ")).toContain("10장");
    expect(store.cards.size).toBe(10);
  });

  it("가득 찬 대화에도 기존 카드는 계속 고칠 수 있고, 새 카드만 거절한다", async () => {
    const store = new FakeStore();
    const first = await ok(store, { cards: Array.from({ length: 10 }, (_, i) => card(`t${i}`)) });
    const out = await ok(store, {
      conversationKey: first.conversationKey,
      cards: [card("t3", { title: "고침" }), card("새주제")],
    });
    expect(out.results.map((r) => r.status)).toEqual(["updated", "rejected"]);
    expect(store.cards.size).toBe(10);
  });
});

describe("제외 주제", () => {
  it("무조건 제외 목록에 있으면 공백·대소문자가 달라도 저장하지 않는다", async () => {
    const store = new FakeStore();
    store.exclusions.blocked = ["개인 일기"];
    const out = await ok(store, { cards: [card("개인일기"), card("연구")] });
    expect(out.results.map((r) => r.status)).toEqual(["excluded", "created"]);
    expect(store.cards.size).toBe(1);
    expect(out.excludedTopics).toEqual(["개인 일기"]);
  });

  it("'항상 제외'로 고른 주제는 저장해 두고, 같은 호출과 이후 호출 모두에서 제외한다", async () => {
    const store = new FakeStore();
    const first = await ok(store, { excludeTopics: ["비밀 주제"], cards: [card("비밀주제"), card("연구")] });
    expect(first.results.map((r) => r.status)).toEqual(["excluded", "created"]);
    expect(store.exclusions.alwaysExcluded).toEqual(["비밀 주제"]);
    expect(first.excludedTopics).toContain("비밀 주제");

    const later = await ok(store, { conversationKey: first.conversationKey, cards: [card("비밀 주제")] });
    expect(later.results[0].status).toBe("excluded");
  });

  it("같은 주제를 두 번 제외해도 목록에는 하나만 남는다", async () => {
    const store = new FakeStore();
    await ok(store, { excludeTopics: ["연구 외", "연구외", "  "], cards: [] });
    expect(store.exclusions.alwaysExcluded).toEqual(["연구 외"]);
  });

  it("제외된 카드는 저장소에 아무것도 쓰지 않는다", async () => {
    const store = new FakeStore();
    store.exclusions.blocked = ["a"];
    await ok(store, { cards: [card("a")] });
    expect(store.insertCalls).toBe(0);
  });
});

describe("질문 횟수와 대화 키", () => {
  it("질문 횟수는 더 큰 값을 유지한다", async () => {
    const store = new FakeStore();
    const first = await ok(store, { questionCount: 1, cards: [] });
    await ok(store, { conversationKey: first.conversationKey, questionCount: 0, cards: [] });
    expect(store.questionCountOf(first.conversationKey)).toBe(1);
  });

  it("없는 대화 키는 요청 전체를 거절한다", async () => {
    const store = new FakeStore();
    const outcome = await recordCards(store, { conversationKey: NOT_EXISTING_KEY, cards: [card("a")] });
    expect(outcome.ok).toBe(false);
    expect(store.cards.size).toBe(0);
  });
});

describe("입력 검사", () => {
  it.each([
    ["cards가 없음", { questionCount: 0 }],
    ["cards가 배열이 아님", { cards: "카드" }],
    ["대화 키가 uuid가 아님", { conversationKey: "abc", cards: [] }],
    ["질문 횟수가 음수", { questionCount: -1, cards: [] }],
    ["질문 횟수가 소수", { questionCount: 0.5, cards: [] }],
    ["제외 주제가 글자가 아님", { excludeTopics: [1], cards: [] }],
    ["통째로 객체가 아님", null],
  ])("%s → 거절", async (_name, input) => {
    const outcome = await recordCards(new FakeStore(), input);
    expect(outcome.ok).toBe(false);
  });
});

describe("저장소 오류", () => {
  it("저장이 실패하면 카드별로 일반 문구로 거절하고, 오류 속 카드 내용은 돌려주지 않는다", async () => {
    const store = new FakeStore({ failWrites: true });
    const out = await ok(store, { cards: [card("a", { summary: "비밀요약" })] });
    expect(out.results[0].status).toBe("rejected");
    expect(out.results[0].reasons?.[0]).toContain("저장하지 못했습니다");
    const text = JSON.stringify(out);
    expect(text).not.toContain("실패한 줄");
    expect(text).not.toContain("비밀요약");
    expect(text).not.toContain("제목-a");
    expect(out.conversationKey).toMatch(UUID_V4);
  });
});
