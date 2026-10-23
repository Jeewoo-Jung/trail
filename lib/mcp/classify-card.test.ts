import { describe, expect, it } from "vitest";
import { classifyCard, classifyPendingThenWaiting, reclassifyWaiting, type Classifier } from "./classify-card";
import type { CardForClassification, ClassifyStore } from "./classify-store";
import type { ConceptRef } from "../rules/classification";

class FakeClassifyStore implements ClassifyStore {
  concepts: ConceptRef[] = [
    { id: "t1", parentId: null, name: "취업준비", status: "approved" },
    { id: "s1", parentId: "t1", name: "정부 부처 인턴 활동", status: "approved" },
  ];
  cards = new Map<string, CardForClassification>();
  status = new Map<string, "pending" | "done" | "waiting">();
  saved = new Map<string, string | null>();
  waiting: string[] = [];
  created: { parentId: string | null; name: string }[] = [];
  addCard(id: string, state: "pending" | "waiting" = "pending") {
    this.cards.set(id, { id, title: `제목-${id}`, summary: "요약", keywords: [], evidence: ["근거"], candidates: [] });
    this.status.set(id, state);
    if (state === "waiting") this.waiting.push(id);
  }
  async listConcepts() { return this.concepts; }
  async getCard(id: string) { return this.cards.get(id) ?? null; }
  async listPendingCardIds(limit: number) { return [...this.cards.keys()].filter((id) => this.status.get(id) === "pending").slice(0, limit); }
  async listWaitingCardIds(limit: number) { return this.waiting.filter((id) => this.status.get(id) === "waiting").slice(0, limit); }
  async createConcept(parentId: string | null, name: string) {
    const found = this.concepts.find((c) => c.parentId === parentId && c.name === name);
    if (found) return found.id;
    const id = `n${this.concepts.length + 1}`;
    this.concepts.push({ id, parentId, name, status: "proposed" });
    this.created.push({ parentId, name });
    return id;
  }
  async saveClassification(cardId: string, conceptId: string | null) { this.saved.set(cardId, conceptId); this.status.set(cardId, "done"); }
  async markWaiting(cardId: string) { this.status.set(cardId, "waiting"); if (!this.waiting.includes(cardId)) this.waiting.push(cardId); }
}

const ok = (value: unknown): Classifier => async () => value;
const failing: Classifier = async () => { throw new Error("한도 도달 — 카드 내용이 섞인 메시지 비밀요약"); };

describe("classifyCard", () => {
  it("기존 개념(가장 깊은 곳)에 분류해 저장한다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    expect(await classifyCard(s, ok({ path: ["취업준비", "정부 부처 인턴 활동"] }), "a")).toBe("done");
    expect(s.saved.get("a")).toBe("s1");
    expect(s.status.get("a")).toBe("done");
    expect(s.created).toEqual([]);
  });
  it("없는 이름부터는 새 개념(제안)으로 만들어 이어 붙인다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    await classifyCard(s, ok({ path: ["취업준비", "자기소개서", "경험 항목"] }), "a");
    expect(s.created).toEqual([{ parentId: "t1", name: "자기소개서" }, { parentId: "n3", name: "경험 항목" }]);
    expect(s.concepts.find((c) => c.name === "경험 항목")?.status).toBe("proposed");
    expect(s.saved.get("a")).toBe("n4");
  });
  it("새 상위 개념(뿌리)도 만든다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    await classifyCard(s, ok({ path: ["건강", "운동"] }), "a");
    expect(s.created).toEqual([{ parentId: null, name: "건강" }, { parentId: "n3", name: "운동" }]);
    expect(s.concepts.find((c) => c.name === "건강")).toMatchObject({ parentId: null, status: "proposed" });
  });
  it("옛 모양({ top, sub })으로 답해도 같은 결과다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    await classifyCard(s, ok({ top: "취업준비", sub: "정부 부처 인턴 활동" }), "a");
    expect(s.saved.get("a")).toBe("s1");
  });
  it("미분류는 개념 없이 끝난 것으로 저장한다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    expect(await classifyCard(s, ok({ path: [] }), "a")).toBe("done");
    expect(s.saved.get("a")).toBeNull();
    expect(s.created).toEqual([]);
  });
  it("Claude 호출이 실패하면 미분류(대기)로 두고 던지지 않는다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    expect(await classifyCard(s, failing, "a")).toBe("waiting");
    expect(s.status.get("a")).toBe("waiting");
  });
  it("모양이 다른 출력은 새 개념을 만들지 않고 미분류로 확정한다(대기로 두지 않는다)", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    expect(await classifyCard(s, ok("엉뚱한 글"), "a")).toBe("done");
    expect(s.saved.get("a")).toBeNull();
    expect(s.created).toEqual([]);
  });
  it("분류기에는 지금 있는 개념의 경로를 알려 준다(거절된 개념은 뺀다)", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    s.concepts.push({ id: "x", parentId: "t1", name: "면접", status: "rejected" });
    let seen: unknown;
    await classifyCard(s, async (input) => { seen = input.concepts; return { path: [] }; }, "a");
    expect(seen).toEqual([
      { path: ["취업준비"], status: "approved" },
      { path: ["취업준비", "정부 부처 인턴 활동"], status: "approved" },
    ]);
  });
  it("없는 카드는 건드리지 않는다", async () => {
    expect(await classifyCard(new FakeClassifyStore(), ok({ path: [] }), "zzz")).toBe("missing");
  });
});

describe("reclassifyWaiting", () => {
  it("대기 카드를 오래된 것부터 다시 분류한다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a", "waiting"); s.addCard("b", "waiting");
    expect(await reclassifyWaiting(s, ok({ path: ["취업준비"] }))).toEqual({ done: 2, stillWaiting: 0 });
  });
  it("한 번에 처리하는 수에 상한을 둔다", async () => {
    const s = new FakeClassifyStore();
    for (const id of ["a", "b", "c", "d"]) s.addCard(id, "waiting");
    expect(await reclassifyWaiting(s, ok({ path: ["취업준비"] }), 2)).toEqual({ done: 2, stillWaiting: 0 });
    expect([...s.status.values()].filter((x) => x === "waiting")).toHaveLength(2);
  });
  it("중간에 한도에 다시 닿으면 거기서 멈추고 나머지는 대기로 남긴다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a", "waiting"); s.addCard("b", "waiting"); s.addCard("c", "waiting");
    let calls = 0;
    const flaky: Classifier = async () => { if (++calls === 2) throw new Error("limit"); return { path: ["취업준비"] }; };
    const r = await reclassifyWaiting(s, flaky);
    expect(r).toEqual({ done: 1, stillWaiting: 2 });
    expect(calls).toBe(2);
  });
});

describe("classifyPendingThenWaiting", () => {
  it("분류 중 카드를 분류한 뒤 대기 카드도 다시 분류한다", async () => {
    const s = new FakeClassifyStore(); s.addCard("p"); s.addCard("w", "waiting");
    await classifyPendingThenWaiting(s, ok({ path: ["취업준비"] }));
    expect([s.status.get("p"), s.status.get("w")]).toEqual(["done", "done"]);
  });
  it("분류 중 카드가 대기로 밀리면(한도) 대기 카드를 또 부르지 않는다", async () => {
    const s = new FakeClassifyStore(); s.addCard("p"); s.addCard("w", "waiting");
    let calls = 0;
    await classifyPendingThenWaiting(s, async () => { calls++; throw new Error("limit"); });
    expect(calls).toBe(1);
    expect(s.status.get("p")).toBe("waiting");
  });
  it("중간에 한도에 닿으면 아직 처리하지 못한 나머지 분류 중 카드도 대기로 돌려 다시 분류될 수 있게 한다", async () => {
    const s = new FakeClassifyStore(); s.addCard("p1"); s.addCard("p2"); s.addCard("p3");
    let calls = 0;
    await classifyPendingThenWaiting(s, async () => { if (++calls === 2) throw new Error("limit"); return { path: ["취업준비"] }; });
    expect(calls).toBe(2);
    expect([s.status.get("p1"), s.status.get("p2"), s.status.get("p3")]).toEqual(["done", "waiting", "waiting"]);
    // 나중에 한도가 풀리면 다시 분류된다
    await reclassifyWaiting(s, ok({ path: ["취업준비"] }));
    expect([...s.status.values()]).toEqual(["done", "done", "done"]);
  });
  it("이상한 출력이 반복돼도 뒤의 카드가 막히지 않는다", async () => {
    const s = new FakeClassifyStore(); s.addCard("w1", "waiting"); s.addCard("w2", "waiting"); s.addCard("w3", "waiting");
    const r = await reclassifyWaiting(s, ok({ path: ["없는개념"] }));
    expect(r).toEqual({ done: 3, stillWaiting: 0 });
  });
});
