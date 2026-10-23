// 진짜 Supabase(내 계정 로그인) + 진짜 Claude API로 분류와 개념 트리가 끝까지 동작하는지 시험한다. (PLAN 10·26번)
// 로그인 정보나 ANTHROPIC_API_KEY가 없으면 건너뛴다. Claude 호출은 아주 적게(카드 1장, 나머지는 가짜 호출기) 쓴다.
// 시험이 만든 개념은 이름이 __시험으로 시작하고, 끝에 그것만 지운다(내가 만든 개념은 절대 지우지 않는다). 실행: npm run test:integration
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveConcept, rejectConcept } from "../my/proposals";
import { createClaudeClassifier } from "../claude/classifier";
import { classifyCard, reclassifyWaiting } from "./classify-card";
import { createSupabaseClassifyStore } from "./supabase-classify-store";
import { createSupabaseCardStore } from "./supabase-store";
import { recordCards } from "./record-cards";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TRAIL_LOGIN_EMAIL;
const password = process.env.TRAIL_LOGIN_PASSWORD;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const enabled = Boolean(url && key && email && password);

describe.skipIf(!enabled)("분류와 개념 트리 (실제 Supabase + 가짜/실제 Claude)", () => {
  let client: SupabaseClient;
  const conversations: string[] = [];

  async function newCard(topicKey: string, summary = "요약") {
    const out = await recordCards(createSupabaseCardStore(client), { cards: [{ topicKey, title: `시험-${topicKey}`, summary, evidence: ["시험 근거"] }] });
    if (!out.ok) throw new Error("기록 거절");
    conversations.push(out.output.conversationKey);
    return out.output.results[0].cardId!;
  }
  const conceptOf = async (cardId: string) => (await client.from("cards").select("classification_status, concept_id").eq("id", cardId).single()).data!;
  const concept = async (id: string | null) => (id ? (await client.from("concepts").select("id, parent_id, name, status, depth").eq("id", id).single()).data : null);
  const byName = async (name: string) => (await client.from("concepts").select("id, parent_id, name, status, depth").eq("name", name).maybeSingle()).data;

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("로그인하지 못했습니다.");
  });

  afterAll(async () => {
    if (!client) return;
    if (conversations.length) await client.from("conversations").delete().in("key", conversations);
    await client.from("concepts").delete().like("name", "\\_\\_시험%");
    // 시험이 만든 로그인만 끝낸다. 전체 로그아웃(global)이면 내가 브라우저에서 쓰는 로그인까지 끊긴다.
    await client.auth.signOut({ scope: "local" });
  });

  it("새 상위 개념(뿌리)과 그 아래 개념을 Claude가 경로로 답하면 제안 상태로 만들고 카드를 맨 아래에 붙인다", async () => {
    const store = createSupabaseClassifyStore(client);
    const id = await newCard("t1");
    expect(await classifyCard(store, async () => ({ path: ["__시험루트", "__시험가지", "__시험잎"] }), id)).toBe("done");
    const row = await conceptOf(id);
    expect(row.classification_status).toBe("done");
    const leaf = await concept(row.concept_id);
    expect(leaf).toMatchObject({ name: "__시험잎", status: "proposed", depth: 3 });
    const branch = await concept(leaf!.parent_id);
    const root = await concept(branch!.parent_id);
    expect([branch!.name, root!.name, root!.parent_id, root!.depth]).toEqual(["__시험가지", "__시험루트", null, 1]);
  });

  it("같은 경로를 또 답하면 새로 만들지 않고 있던 개념을 쓴다", async () => {
    const store = createSupabaseClassifyStore(client);
    const before = (await client.from("concepts").select("id", { count: "exact", head: true }).like("name", "\\_\\_시험%")).count;
    const id = await newCard("t2");
    await classifyCard(store, async () => ({ path: ["__시험루트", "__시험가지", "__시험잎"] }), id);
    expect((await client.from("concepts").select("id", { count: "exact", head: true }).like("name", "\\_\\_시험%")).count).toBe(before);
  });

  it("5단계까지 가지치기하고, 6단계 이름은 만들지 않는다", async () => {
    const store = createSupabaseClassifyStore(client);
    const id = await newCard("t3");
    await classifyCard(store, async () => ({ path: ["__시험루트", "__시험가지", "__시험잎", "__시험4", "__시험5", "__시험6"] }), id);
    const card = await concept((await conceptOf(id)).concept_id);
    expect(card).toMatchObject({ name: "__시험5", depth: 5 });
    expect(await byName("__시험6")).toBeNull();
  });

  it("가지째 승인: 맨 위 제안을 승인하면 그 아래 제안도 함께 승인된다. 부모가 제안 중인 자식만 따로 승인할 수는 없다", async () => {
    const root = (await byName("__시험루트"))!;
    const branch = (await byName("__시험가지"))!;
    expect(await approveConcept(client, branch.id)).toBe(false); // 부모(루트)가 아직 승인되지 않음
    expect(await approveConcept(client, root.id)).toBe(true);
    for (const name of ["__시험루트", "__시험가지", "__시험잎", "__시험4", "__시험5"]) expect((await byName(name))?.status).toBe("approved");
    expect(await approveConcept(client, root.id)).toBe(false); // 이미 처리됨
  });

  it("가지째 거절: 개념은 거절 상태로 남고(이름 재제안 방지), 카드는 부모 개념으로 올라간다. 뿌리를 거절하면 미분류가 된다", async () => {
    const store = createSupabaseClassifyStore(client);
    const idA = await newCard("t4");
    await classifyCard(store, async () => ({ path: ["__시험루트", "__시험새가지"] }), idA);
    const fresh = (await byName("__시험새가지"))!;
    expect(fresh.status).toBe("proposed");
    expect(await rejectConcept(client, fresh.id)).toBe(true);
    expect((await byName("__시험새가지"))?.status).toBe("rejected");
    expect((await conceptOf(idA)).concept_id).toBe(fresh.parent_id); // 부모(__시험루트)로 올라감
    // 같은 이름을 다시 답해도 새로 만들지 않고 부모에 붙인다
    const idB = await newCard("t5");
    await classifyCard(store, async () => ({ path: ["__시험루트", "__시험새가지"] }), idB);
    expect((await conceptOf(idB)).concept_id).toBe(fresh.parent_id);

    // 새 뿌리를 거절하면 카드는 미분류가 된다
    const idC = await newCard("t6");
    await classifyCard(store, async () => ({ path: ["__시험뿌리2", "__시험아래"] }), idC);
    const root2 = (await byName("__시험뿌리2"))!;
    expect(await rejectConcept(client, root2.id)).toBe(true);
    expect((await conceptOf(idC)).concept_id).toBeNull();
    expect((await byName("__시험아래"))?.status).toBe("rejected");
  });

  it("Claude 호출이 실패하면 waiting이 되고, 풀린 뒤 다시 분류하면 done이 된다", async () => {
    const store = createSupabaseClassifyStore(client);
    const id = await newCard("t7");
    expect(await classifyCard(store, async () => { throw new Error("limit"); }, id)).toBe("waiting");
    expect((await conceptOf(id)).classification_status).toBe("waiting");
    const r = await reclassifyWaiting(store, async () => ({ path: [] }));
    expect(r.stillWaiting).toBe(0);
    expect((await conceptOf(id)).classification_status).toBe("done");
  });

  it("개념은 같은 부모 아래에서 이름이 겹치지 않고, 남의 부모를 가리킬 수 없다", async () => {
    const root = (await byName("__시험루트"))!;
    const dup = await client.from("concepts").insert({ parent_id: root.id, name: "__시험가지", status: "proposed" });
    expect(dup.error?.code).toBe("23505");
    const fake = await client.from("concepts").insert({ parent_id: "00000000-0000-4000-8000-000000000000", name: "__시험고아" });
    expect(fake.error).not.toBeNull();
  });

  it.skipIf(!anthropicKey)("진짜 Claude(claude-haiku-5-5)가 카드를 개념 경로로 분류한다(내 개념 트리 안이거나 새 경로)", async () => {
    const store = createSupabaseClassifyStore(client);
    const id = await newCard("t8", "배포는 Vercel을 쓰기로 정했고, 환경변수는 앱이 쓰는 것만 등록한다.");
    const outcome = await classifyCard(store, createClaudeClassifier(anthropicKey!), id);
    expect(outcome).toBe("done");
    const row = await conceptOf(id);
    // Claude가 새 경로를 만들었다면 그것도 지운다(시험 이름이 아니라서 따로 지워야 한다)
    const placed = await concept(row.concept_id);
    expect(placed).not.toBeNull(); // 미분류가 아니라 어떤 개념에든 붙었다
    // 이 시험이 새로 만든 개념(제안 상태이면서 방금 만든 것)만 정리한다: 카드를 지우면 개념이 비어 있을 때만
    if (placed?.status === "proposed") {
      const remaining = await client.from("cards").select("id", { count: "exact", head: true }).eq("concept_id", placed.id);
      await client.from("conversations").delete().in("key", conversations);
      if ((await client.from("cards").select("id", { count: "exact", head: true }).eq("concept_id", placed.id)).count === 0 && remaining.count !== null) {
        await client.from("concepts").delete().eq("id", placed.id).eq("status", "proposed");
      }
    }
  });
});
