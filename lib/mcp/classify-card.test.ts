import { describe, expect, it } from "vitest";
import { classifyCard, classifyPendingThenWaiting, reclassifyWaiting, type Classifier } from "./classify-card";
import type { CardForClassification, ClassifyStore } from "./classify-store";
import type { SubConceptRef, TopConceptRef } from "../rules/classification";

class FakeClassifyStore implements ClassifyStore {
  tops: TopConceptRef[] = [{ id: "t1", name: "취업준비" }];
  subs: SubConceptRef[] = [{ id: "s1", topId: "t1", name: "정부 부처 인턴 활동", status: "approved" }];
  cards = new Map<string, CardForClassification>();
  status = new Map<string, "pending" | "done" | "waiting">();
  saved = new Map<string, { topId: string | null; subId: string | null }>();
  waiting: string[] = [];
  addCard(id: string, state: "pending" | "waiting" = "pending") {
    this.cards.set(id, { id, title: `제목-${id}`, summary: "요약", keywords: [], evidence: ["근거"], candidates: [] });
    this.status.set(id, state);
    if (state === "waiting") this.waiting.push(id);
  }
  async listTopConcepts() { return this.tops; }
  async listSubConcepts() { return this.subs; }
  async getCard(id: string) { return this.cards.get(id) ?? null; }
  async listPendingCardIds(limit: number) { return [...this.cards.keys()].filter((id) => this.status.get(id) === "pending").slice(0, limit); }
  async listWaitingCardIds(limit: number) { return this.waiting.filter((id) => this.status.get(id) === "waiting").slice(0, limit); }
  async createSubProposal(topId: string, name: string) {
    const found = this.subs.find((s) => s.topId === topId && s.name === name);
    if (found) return found.id;
    const id = `s${this.subs.length + 1}`;
    this.subs.push({ id, topId, name, status: "proposed" });
    return id;
  }
  async saveClassification(cardId: string, topId: string | null, subId: string | null) { this.saved.set(cardId, { topId, subId }); this.status.set(cardId, "done"); }
  async markWaiting(cardId: string) { this.status.set(cardId, "waiting"); if (!this.waiting.includes(cardId)) this.waiting.push(cardId); }
}

const ok = (value: unknown): Classifier => async () => value;
const failing: Classifier = async () => { throw new Error("한도 도달 — 카드 내용이 섞인 메시지 비밀요약"); };

describe("classifyCard", () => {
  it("기존 하위 개념으로 분류해 저장한다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    expect(await classifyCard(s, ok({ top: "취업준비", sub: "정부 부처 인턴 활동" }), "a")).toBe("done");
    expect(s.saved.get("a")).toEqual({ topId: "t1", subId: "s1" });
    expect(s.status.get("a")).toBe("done");
  });
  it("새 하위 개념은 '제안'으로 만들어 연결한다 (승인 전에는 확정하지 않음)", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    await classifyCard(s, ok({ top: "취업준비", sub: "자기소개서" }), "a");
    expect(s.subs.find((x) => x.name === "자기소개서")?.status).toBe("proposed");
    expect(s.saved.get("a")?.subId).toBe("s2");
  });
  it("미분류는 상위·하위 없이 끝난 것으로 저장한다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    expect(await classifyCard(s, ok({ top: "미분류" }), "a")).toBe("done");
    expect(s.saved.get("a")).toEqual({ topId: null, subId: null });
  });
  it("Claude 호출이 실패하면 미분류(대기)로 두고 던지지 않는다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    expect(await classifyCard(s, failing, "a")).toBe("waiting");
    expect(s.status.get("a")).toBe("waiting");
  });
  it("목록 밖 상위 개념이 오면 새 상위 개념을 만들지 않고 대기로 둔다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a");
    expect(await classifyCard(s, ok({ top: "요리" }), "a")).toBe("waiting");
    expect(s.tops).toHaveLength(1);
  });
  it("없는 카드는 건드리지 않는다", async () => {
    expect(await classifyCard(new FakeClassifyStore(), ok({ top: "미분류" }), "zzz")).toBe("missing");
  });
});

describe("reclassifyWaiting", () => {
  it("대기 카드를 오래된 것부터 다시 분류한다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a", "waiting"); s.addCard("b", "waiting");
    expect(await reclassifyWaiting(s, ok({ top: "취업준비" }))).toEqual({ done: 2, stillWaiting: 0 });
  });
  it("한 번에 처리하는 수에 상한을 둔다", async () => {
    const s = new FakeClassifyStore();
    for (const id of ["a", "b", "c", "d"]) s.addCard(id, "waiting");
    expect(await reclassifyWaiting(s, ok({ top: "취업준비" }), 2)).toEqual({ done: 2, stillWaiting: 0 });
    expect([...s.status.values()].filter((x) => x === "waiting")).toHaveLength(2);
  });
  it("중간에 한도에 다시 닿으면 거기서 멈추고 나머지는 대기로 남긴다", async () => {
    const s = new FakeClassifyStore(); s.addCard("a", "waiting"); s.addCard("b", "waiting"); s.addCard("c", "waiting");
    let calls = 0;
    const flaky: Classifier = async () => { if (++calls === 2) throw new Error("limit"); return { top: "취업준비" }; };
    const r = await reclassifyWaiting(s, flaky);
    expect(r).toEqual({ done: 1, stillWaiting: 2 });
    expect(calls).toBe(2);
  });
});

describe("classifyPendingThenWaiting", () => {
  it("분류 중 카드를 분류한 뒤 대기 카드도 다시 분류한다", async () => {
    const s = new FakeClassifyStore(); s.addCard("p"); s.addCard("w", "waiting");
    await classifyPendingThenWaiting(s, ok({ top: "취업준비" }));
    expect([s.status.get("p"), s.status.get("w")]).toEqual(["done", "done"]);
  });
  it("분류 중 카드가 대기로 밀리면(한도) 대기 카드를 또 부르지 않는다", async () => {
    const s = new FakeClassifyStore(); s.addCard("p"); s.addCard("w", "waiting");
    let calls = 0;
    await classifyPendingThenWaiting(s, async () => { calls++; throw new Error("limit"); });
    expect(calls).toBe(1);
    expect(s.status.get("p")).toBe("waiting");
  });
});
