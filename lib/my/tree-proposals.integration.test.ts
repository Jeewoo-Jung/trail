// 진짜 Supabase(내 계정 로그인)에서 정리 제안의 생성·승인·거절이 실제로 적용되는지 시험한다. (PLAN 23번)
// 로그인 정보가 없으면 건너뛴다. Claude는 부르지 않고 가짜 제안기를 쓴다. 시험 데이터는 이름이 __시험으로 시작하고 끝에 모두 지운다.
// 실행: npm run test:integration
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Advisor } from "../claude/tree-advisor";
import { approveProposal, generateProposals, listPendingProposals, rejectProposal } from "./tree-proposals";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TRAIL_LOGIN_EMAIL;
const password = process.env.TRAIL_LOGIN_PASSWORD;
const enabled = Boolean(url && key && email && password);

describe.skipIf(!enabled)("트리 정리 제안 (실제 로그인으로 시험)", () => {
  let client: SupabaseClient;
  let topId = "";
  let convKey = "";
  let subA = "";
  let subB = "";
  const cardIds: string[] = [];

  async function addCard(topic: string, subId: string): Promise<string> {
    const { data, error } = await client
      .from("cards")
      .insert({ conversation_key: convKey, topic_key: topic, title: `__시험 ${topic}`, top_concept_id: topId, sub_concept_id: subId, classification_status: "done" })
      .select("id")
      .single();
    if (error) throw new Error("시험 카드 만들기 실패");
    cardIds.push(data.id);
    return data.id;
  }
  const countOf = async (subId: string) => (await client.from("cards").select("id", { count: "exact", head: true }).eq("sub_concept_id", subId)).count;

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("로그인하지 못했습니다.");
    topId = (await client.from("top_concepts").select("id").limit(1).single()).data!.id;
    convKey = (await client.from("conversations").insert({}).select("key").single()).data!.key;
    subA = (await client.from("sub_concepts").insert({ top_concept_id: topId, name: "__시험A", status: "approved" }).select("id").single()).data!.id;
    subB = (await client.from("sub_concepts").insert({ top_concept_id: topId, name: "__시험B", status: "approved" }).select("id").single()).data!.id;
  });

  afterAll(async () => {
    if (!client) return;
    await client.from("tree_proposals").delete().eq("top_concept_id", topId).or(`signature.like.%${subA}%,signature.like.%${subB}%`);
    await client.from("cards").delete().eq("conversation_key", convKey);
    await client.from("conversations").delete().eq("key", convKey);
    await client.from("sub_concepts").delete().like("name", "\\_\\_시험%");
    await client.auth.signOut({ scope: "local" });
  });

  const advice = (subAId: string, subBId: string, a: string[]): Advisor => async () => ({
    merges: [{ from: subBId, into: subAId }],
    splits: [{ sub: subAId, parts: [{ name: "__시험 새1", cards: a.slice(0, 2) }, { name: "__시험 새2", cards: a.slice(2, 3) }] }],
  });

  it("제안을 만들고, 같은 제안은 다시 만들지 않는다", async () => {
    const a = [await addCard("a0", subA), await addCard("a1", subA), await addCard("a2", subA), await addCard("a3", subA)];
    await addCard("b0", subB);
    const first = await generateProposals(client, advice(subA, subB, a));
    expect(first).toEqual({ created: 2, skipped: null });
    const again = await generateProposals(client, advice(subA, subB, a));
    expect(again.created).toBe(0);
    const pending = (await listPendingProposals(client)).filter((p) => JSON.stringify(p.payload).includes(subA) || JSON.stringify(p.payload).includes(subB));
    expect(pending.map((p) => p.kind).sort()).toEqual(["merge", "split"]);
  });

  it("병합을 승인하면 카드가 옮겨지고 합쳐진 하위 개념이 사라진다. 두 번 승인은 되지 않는다", async () => {
    const merge = (await listPendingProposals(client)).find((p) => p.kind === "merge" && JSON.stringify(p.payload).includes(subB))!;
    expect(await approveProposal(client, merge.id, "merge")).toBe(true);
    expect(await countOf(subA)).toBe(5);
    expect((await client.from("sub_concepts").select("id").eq("id", subB)).data).toHaveLength(0);
    expect(await approveProposal(client, merge.id, "merge")).toBe(false);
  });

  it("분리를 승인하면 새 하위 개념이 만들어지고 정한 카드만 옮겨진다", async () => {
    const split = (await listPendingProposals(client)).find((p) => p.kind === "split" && JSON.stringify(p.payload).includes(subA))!;
    expect(await approveProposal(client, split.id, "split")).toBe(true);
    const news = (await client.from("sub_concepts").select("id, name, status").like("name", "\\_\\_시험 새%").order("name")).data ?? [];
    expect(news.map((n) => [n.name, n.status])).toEqual([["__시험 새1", "approved"], ["__시험 새2", "approved"]]);
    expect(await countOf(news[0].id)).toBe(2);
    expect(await countOf(news[1].id)).toBe(1);
    expect(await countOf(subA)).toBe(2); // 나머지(원래 하위 개념에 남는 카드)
  });

  it("거절한 제안은 다시 만들지 않고, 대상이 사라진 제안은 승인되지 않는다", async () => {
    const x = (await client.from("sub_concepts").insert({ top_concept_id: topId, name: "__시험X", status: "approved" }).select("id").single()).data!.id;
    const advisor: Advisor = async () => ({ merges: [{ from: x, into: subA }], splits: [] });
    expect((await generateProposals(client, advisor)).created).toBe(1);
    const p = (await listPendingProposals(client)).find((q) => JSON.stringify(q.payload).includes(x))!;
    expect(await rejectProposal(client, p.id)).toBe(true);
    expect(await rejectProposal(client, p.id)).toBe(false);
    expect((await generateProposals(client, advisor)).created).toBe(0);

    // 대상이 사라진 뒤의 승인
    const y = (await client.from("sub_concepts").insert({ top_concept_id: topId, name: "__시험Y", status: "approved" }).select("id").single()).data!.id;
    expect((await generateProposals(client, async () => ({ merges: [{ from: y, into: subA }], splits: [] }))).created).toBe(1);
    const q = (await listPendingProposals(client)).find((r) => JSON.stringify(r.payload).includes(y))!;
    await client.from("sub_concepts").delete().eq("id", y);
    expect(await approveProposal(client, q.id, "merge")).toBe(false);
  });

  it("로그인하지 않은 연결로는 제안을 읽을 수 없다", async () => {
    const res = await createClient(url!, key!).from("tree_proposals").select("id").limit(1);
    expect(res.error).not.toBeNull();
  });
});
