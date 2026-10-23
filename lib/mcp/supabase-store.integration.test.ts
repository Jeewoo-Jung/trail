// 진짜 Supabase에 내 계정으로 로그인해서 저장소·기록·조회가 실제로 동작하는지 시험한다. (PLAN 8번)
// 로그인 정보가 환경변수에 없으면 건너뛴다. 그래서 평소의 `npm test`는 네트워크를 쓰지 않는다.
// 실행: npm run test:integration   (.env와 .env.local의 값을 읽는다)
// 시험 데이터는 끝에 반드시 지우고, 내 제외 목록(settings)도 시험 전 상태로 되돌린다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listCards } from "./list-cards";
import { recordCards, type RecordOutput } from "./record-cards";
import { createSupabaseRateStore } from "./supabase-rate-store";
import { createSupabaseCardStore } from "./supabase-store";
import type { CardStore } from "./store";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TRAIL_LOGIN_EMAIL;
const password = process.env.TRAIL_LOGIN_PASSWORD;
const enabled = Boolean(url && key && email && password);

const FAKE_KEY = "sk-" + "aB3dE5fG7hJ9kL2mN4pQ6rS8".repeat(2);
const card = (topicKey: string, extra: Record<string, unknown> = {}) => ({
  topicKey,
  title: `시험-${topicKey}`,
  summary: "요약",
  evidence: ["근거"],
  ...extra,
});

describe.skipIf(!enabled)("Supabase 저장소 (실제 로그인으로 시험)", () => {
  let client: SupabaseClient;
  let store: CardStore;
  let userId = "";
  const conversations: string[] = [];
  const RATE_WINDOW = new Date(Date.UTC(2000, 0, 1)); // 실제 사용 구간과 겹치지 않는 먼 과거
  let settingsBefore: { always_excluded: string[]; blocked: string[] } | null = null;

  async function record(input: Record<string, unknown>): Promise<RecordOutput> {
    const outcome = await recordCards(store, input);
    if (!outcome.ok) throw new Error(`기록 거절: ${outcome.errors.join(" / ")}`);
    if (!conversations.includes(outcome.output.conversationKey)) conversations.push(outcome.output.conversationKey);
    return outcome.output;
  }

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { data, error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error("로그인하지 못했습니다. .env의 TRAIL_LOGIN_EMAIL·PASSWORD를 확인해 주세요.");
    userId = data.user.id;
    store = createSupabaseCardStore(client);
    const before = await client.from("settings").select("always_excluded, blocked").maybeSingle();
    settingsBefore = before.data;
  });

  afterAll(async () => {
    if (!client) return;
    await client.from("api_calls").delete().eq("window_start", RATE_WINDOW.toISOString());
    if (conversations.length > 0) await client.from("conversations").delete().in("key", conversations);
    if (settingsBefore === null) await client.from("settings").delete().eq("user_id", userId);
    else await client.from("settings").update(settingsBefore).eq("user_id", userId);
    // 시험이 만든 로그인만 끝낸다. 전체 로그아웃(global)이면 내가 브라우저에서 쓰는 로그인까지 끊긴다.
    await client.auth.signOut({ scope: "local" });
  });

  it("내 계정으로 로그인했다 (OWNER_USER_ID와 같은 계정)", () => {
    expect(userId).not.toBe("");
    if (process.env.OWNER_USER_ID) expect(userId).toBe(process.env.OWNER_USER_ID);
  });

  it("처음 조회는 카드가 비어 있고 개념·제외 목록은 배열이다", async () => {
    const outcome = await listCards(store, {});
    if (!outcome.ok) throw new Error("조회 실패");
    expect(outcome.output.cards).toEqual([]);
    expect(Array.isArray(outcome.output.concepts)).toBe(true);
    expect(Array.isArray(outcome.output.excludedTopics)).toBe(true);
  });

  let first: RecordOutput;
  it("새 대화에 카드 둘을 기록하면 저장되고, 키 모양 글자는 가려진다", async () => {
    first = await record({ questionCount: 1, cards: [card("a", { summary: `키는 ${FAKE_KEY}` }), card("b", { evidence: [] })] });
    expect(first.results.map((r) => r.status)).toEqual(["created", "created"]);

    const rows = await client.from("cards").select("id, summary, classification_status, user_id").in("id", first.results.map((r) => r.cardId!));
    const byId = new Map((rows.data ?? []).map((r) => [r.id, r]));
    const a = byId.get(first.results[0].cardId!)!;
    const b = byId.get(first.results[1].cardId!)!;
    expect(a.summary).toBe("키는 ●●●");
    expect(a.user_id).toBe(userId);
    expect(a.classification_status).toBe("pending");
    expect(b.summary).toBe(""); // 근거가 없으면 요약을 비운다
    const conv = await client.from("conversations").select("card_count, question_count").eq("key", first.conversationKey).single();
    expect(conv.data).toEqual({ card_count: 2, question_count: 1 });
  });

  it("같은 대화의 카드 목록을 id·주제 키·제목으로 조회한다", async () => {
    const outcome = await listCards(store, { conversationKey: first.conversationKey });
    if (!outcome.ok) throw new Error("조회 실패");
    expect(outcome.output.cards.map((c) => [c.topicKey, c.title])).toEqual([
      ["a", "시험-a"],
      ["b", "시험-b"],
    ]);
    expect(JSON.stringify(outcome.output)).not.toContain(FAKE_KEY);
  });

  it("같은 주제로 다시 보내면 새 카드가 아니라 갱신이고, 분류 상태는 '분류 중'으로 돌아간다", async () => {
    const id = first.results[0].cardId!;
    await client.from("cards").update({ classification_status: "done" }).eq("id", id);
    const out = await record({ conversationKey: first.conversationKey, cards: [card("a", { title: "고친 제목" })] });
    expect(out.results[0]).toMatchObject({ status: "updated", cardId: id });
    const row = await client.from("cards").select("title, classification_status").eq("id", id).single();
    expect(row.data).toEqual({ title: "고친 제목", classification_status: "pending" });
    const count = await client.from("cards").select("id", { count: "exact", head: true }).eq("conversation_key", first.conversationKey);
    expect(count.count).toBe(2);
  });

  it("내용이 같으면 쓰지 않는다 (수정 시각이 그대로)", async () => {
    const id = first.results[0].cardId!;
    const before = await client.from("cards").select("updated_at").eq("id", id).single();
    // 바로 앞 시험에서 저장한 내용(제목만 고침, 요약은 "요약") 그대로 다시 보낸다
    const out = await record({ conversationKey: first.conversationKey, cards: [card("a", { title: "고친 제목" })] });
    expect(out.results[0].notes?.join(" ")).toContain("바뀐 내용이 없어");
    const after = await client.from("cards").select("updated_at").eq("id", id).single();
    expect(after.data?.updated_at).toBe(before.data?.updated_at);
  });

  it("uuid 모양이 아닌 카드 id는 오류 없이 '찾지 못함'으로 거절한다", async () => {
    const out = await record({ conversationKey: first.conversationKey, cards: [card("c", { cardId: "없는-id" })] });
    expect(out.results[0].status).toBe("rejected");
  });

  it("대화당 10장: 앱이 먼저 거절하고, 데이터베이스도 11번째를 막는다", async () => {
    const more = await record({
      conversationKey: first.conversationKey,
      cards: Array.from({ length: 9 }, (_, i) => card(`m${i}`)),
    });
    expect(more.results.filter((r) => r.status === "created")).toHaveLength(8); // 이미 2장이 있으니 8장만 더 들어간다
    expect(more.results[8].status).toBe("rejected");
    const direct = await client.from("cards").insert({ conversation_key: first.conversationKey, topic_key: "직접", title: "직접" });
    expect(direct.error?.code).toBe("23514");
  });

  it("'항상 제외'로 고른 주제는 내 설정에 저장되고, 그 주제 카드는 저장되지 않는다", async () => {
    const out = await record({ excludeTopics: ["__시험 제외 주제__"], cards: [card("__시험제외주제__")] });
    expect(out.results[0].status).toBe("excluded");
    expect(out.excludedTopics).toContain("__시험 제외 주제__");
    const exclusions = await store.getExclusions();
    expect(exclusions.alwaysExcluded).toContain("__시험 제외 주제__");
    const cards = await client.from("cards").select("id", { count: "exact", head: true }).eq("conversation_key", out.conversationKey);
    expect(cards.count).toBe(0);
    const listed = await listCards(store, {});
    if (!listed.ok) throw new Error("조회 실패");
    expect(listed.output.excludedTopics).toContain("__시험 제외 주제__");
  });

  it("없는 대화 키는 거절한다", async () => {
    const outcome = await recordCards(store, { conversationKey: "11111111-1111-4111-8111-111111111111", cards: [] });
    expect(outcome.ok).toBe(false);
  });

  it("호출 횟수는 같은 구간에서 1씩 올라간다", async () => {
    const rate = createSupabaseRateStore(client);
    expect(await rate.increment("minute", RATE_WINDOW)).toBe(1);
    expect(await rate.increment("minute", RATE_WINDOW)).toBe(2);
    expect(await rate.increment("day", RATE_WINDOW)).toBe(1);
  });

  it("로그인하지 않은 연결로는 카드를 읽을 수 없다", async () => {
    const anonymous = createClient(url!, key!);
    const res = await anonymous.from("cards").select("id").limit(1);
    expect(res.error).not.toBeNull();
    expect(res.data).toBeNull();
  });
});
