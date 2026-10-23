// 진짜 Supabase(내 계정 로그인) + 진짜 Claude API로 분류가 끝까지 동작하는지 시험한다. (PLAN 10번)
// 로그인 정보나 ANTHROPIC_API_KEY가 없으면 건너뛴다. Claude 호출은 아주 적게(카드 1장, 한도 시험은 가짜 호출기) 쓴다.
// 시험 데이터(대화·카드·시험용 제안 하위 개념)는 끝에 지운다. 실행: npm run test:integration
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveSubConcept, rejectSubConcept } from "../my/proposals";
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

describe.skipIf(!enabled)("분류 (실제 Supabase + 가짜/실제 Claude)", () => {
  let client: SupabaseClient;
  const conversations: string[] = [];
  const createdSubs: string[] = [];
  let preexistingSubs = new Set<string>();

  async function newCard(topicKey: string, summary: string) {
    const out = await recordCards(createSupabaseCardStore(client), {
      cards: [{ topicKey, title: `시험-${topicKey}`, summary, evidence: ["시험 근거"] }],
    });
    if (!out.ok) throw new Error("기록 거절");
    conversations.push(out.output.conversationKey);
    return out.output.results[0].cardId!;
  }

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("로그인하지 못했습니다.");
    // 시험 전부터 있던 하위 개념(내가 승인한 것)은 절대 지우지 않는다.
    preexistingSubs = new Set(((await client.from("sub_concepts").select("id")).data ?? []).map((r) => r.id));
  });

  afterAll(async () => {
    if (!client) return;
    if (conversations.length) await client.from("conversations").delete().in("key", conversations);
    const toDelete = createdSubs.filter((id) => !preexistingSubs.has(id));
    if (toDelete.length) await client.from("sub_concepts").delete().in("id", toDelete);
    // 시험이 만든 로그인만 끝낸다. 전체 로그아웃(global)이면 내가 브라우저에서 쓰는 로그인까지 끊긴다.
    await client.auth.signOut({ scope: "local" });
  });

  it("가짜 Claude가 신규 하위 개념을 제안하면 제안 상태로 저장되고 카드는 done이 된다", async () => {
    const store = createSupabaseClassifyStore(client);
    const id = await newCard("t1", "요약");
    const outcome = await classifyCard(store, async () => ({ top: "취업준비", sub: "__시험제안__" }), id);
    expect(outcome).toBe("done");
    const card = await client.from("cards").select("classification_status, top_concept_id, sub_concept_id").eq("id", id).single();
    expect(card.data?.classification_status).toBe("done");
    expect(card.data?.top_concept_id).not.toBeNull();
    const sub = await client.from("sub_concepts").select("id, name, status").eq("id", card.data!.sub_concept_id).single();
    createdSubs.push(sub.data!.id);
    expect(sub.data).toMatchObject({ name: "__시험제안__", status: "proposed" });
  });

  it("같은 제안 이름이 또 오면 새로 만들지 않고 재사용한다", async () => {
    const store = createSupabaseClassifyStore(client);
    const id = await newCard("t2", "요약");
    await classifyCard(store, async () => ({ top: "취업준비", sub: "__시험제안__" }), id);
    const subs = await client.from("sub_concepts").select("id").eq("name", "__시험제안__");
    expect(subs.data).toHaveLength(1);
  });

  it("Claude 호출이 실패하면 waiting이 되고, 풀린 뒤 다시 분류하면 done이 된다", async () => {
    const store = createSupabaseClassifyStore(client);
    const id = await newCard("t3", "요약");
    expect(await classifyCard(store, async () => { throw new Error("limit"); }, id)).toBe("waiting");
    expect((await client.from("cards").select("classification_status").eq("id", id).single()).data?.classification_status).toBe("waiting");
    const r = await reclassifyWaiting(store, async () => ({ top: "미분류" }));
    expect(r.stillWaiting).toBe(0);
    expect((await client.from("cards").select("classification_status").eq("id", id).single()).data?.classification_status).toBe("done");
  });

  it("제안을 거절하면 카드는 하위 미정이 되고, 같은 이름은 다시 제안되지 않는다. 승인은 확정한다", async () => {
    const store = createSupabaseClassifyStore(client);
    const id = await newCard("t5", "요약");
    await classifyCard(store, async () => ({ top: "취업준비", sub: "__시험거절__" }), id);
    const subId = (await client.from("cards").select("sub_concept_id").eq("id", id).single()).data!.sub_concept_id as string;
    createdSubs.push(subId);
    expect(await rejectSubConcept(client, subId)).toBe(true);
    expect((await client.from("cards").select("sub_concept_id").eq("id", id).single()).data?.sub_concept_id).toBeNull();
    expect(await rejectSubConcept(client, subId)).toBe(false); // 이미 처리됨
    expect(await approveSubConcept(client, subId)).toBe(false); // 거절된 것은 승인할 수 없다

    const again = await newCard("t6", "요약");
    await classifyCard(store, async () => ({ top: "취업준비", sub: "__시험거절__" }), again);
    const row = await client.from("cards").select("sub_concept_id, classification_status").eq("id", again).single();
    expect(row.data).toEqual({ sub_concept_id: null, classification_status: "done" });

    await classifyCard(store, async () => ({ top: "취업준비", sub: "__시험승인__" }), again);
    const okSub = (await client.from("cards").select("sub_concept_id").eq("id", again).single()).data!.sub_concept_id as string;
    createdSubs.push(okSub);
    expect(await approveSubConcept(client, okSub)).toBe(true);
    expect((await client.from("sub_concepts").select("status").eq("id", okSub).single()).data?.status).toBe("approved");
  });

  it.skipIf(!anthropicKey)("진짜 Claude(claude-haiku-5-5)가 취업 관련 카드를 취업준비로 분류한다", async () => {
    const store = createSupabaseClassifyStore(client);
    const id = await newCard("t4", "정부 부처 인턴 활동에서 맡은 업무를 정리해 자기소개서 경험 항목으로 쓰기로 결정함");
    const outcome = await classifyCard(store, createClaudeClassifier(anthropicKey!), id);
    const card = await client.from("cards").select("classification_status, sub_concept_id, top_concepts(name)").eq("id", id).single();
    if (card.data?.sub_concept_id) createdSubs.push(card.data.sub_concept_id as string);
    expect(outcome).toBe("done");
    const top = card.data?.top_concepts as unknown as { name: string } | null;
    expect(top?.name).toBe("취업준비");
  });
});
