// 진짜 Supabase(내 계정 로그인)에서 활동 기록·병합·목록 조회가 끝까지 동작하는지 시험한다. (PLAN 33번)
// 시험 데이터는 이름이 __시험으로 시작하고 끝에 그것만 지운다. 실행: npm run test:integration
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listActivities } from "./list-activities";
import { recordActivities, type RecordOutput } from "./record-activities";
import { createSupabaseNodeStore } from "./supabase-node-store";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TRAIL_LOGIN_EMAIL;
const password = process.env.TRAIL_LOGIN_PASSWORD;
const enabled = Boolean(url && key && email && password);

const ev = (excerpt = "원문 발췌") => ({ conversationTitle: "__시험 대화", conversationDate: "2026-10-01", excerpt });
const fld = (text: string, subject = "did", evidence = [ev()]) => ({ text, subject, evidence });

describe.skipIf(!enabled)("활동 기록·병합 (실제 로그인으로 시험)", () => {
  let client: SupabaseClient;
  const conversations: string[] = [];
  const ok = (r: Awaited<ReturnType<typeof recordActivities>>): RecordOutput => {
    if (!r.ok) throw new Error(r.errors.join(","));
    if (!conversations.includes(r.output.conversationKey)) conversations.push(r.output.conversationKey);
    return r.output;
  };

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("로그인하지 못했습니다.");
  });
  afterAll(async () => {
    if (!client) return;
    await client.from("nodes").delete().like("name", "\\_\\_시험%");
    if (conversations.length) await client.from("conversations").delete().in("key", conversations);
    await client.auth.signOut({ scope: "local" });
  });

  it("새 활동을 프로젝트와 함께 만들고 항목·근거·산출물을 저장한다", async () => {
    const store = createSupabaseNodeStore(client);
    const out = ok(await recordActivities(store, {
      questionCount: 1,
      topicKey: "__시험주제",
      activities: [{ name: "__시험활동", projectName: "__시험프로젝트", startDate: "2026-09-01", fields: { situation: fld("상황 내용"), action: fld("한 일", "plan", [ev("a"), ev("b")]), task: fld("근거 없음", "did", []) }, outputs: [{ name: "__시험보고서", url: "https://example.com/r" }] }],
    }));
    expect(out.results[0]).toMatchObject({ status: "created", name: "__시험활동", fields: { situation: "set", action: "set", task: "dropped" }, outputsAdded: 1 });
    const id = out.results[0].nodeId!;
    const node = (await client.from("nodes").select("*").eq("id", id).single()).data!;
    expect(node).toMatchObject({ kind: "activity", created_by: "ai", start_date: "2026-09-01", deleted_at: null });
    const project = (await client.from("nodes").select("*").eq("id", node.parent_id).single()).data!;
    expect(project).toMatchObject({ kind: "project", name: "__시험프로젝트", created_by: "ai" });
    const fields = (await client.from("node_fields").select("field, text, subject, locked, updated_by").eq("node_id", id)).data!;
    expect(fields.map((f) => f.field).sort()).toEqual(["action", "situation"]);
    expect(fields.find((f) => f.field === "action")).toMatchObject({ subject: "plan", locked: false, updated_by: "ai" });
    expect((await client.from("evidence").select("id").eq("node_id", id).eq("field", "action")).data).toHaveLength(2);
    expect((await client.from("outputs").select("name, url").eq("node_id", id)).data).toEqual([{ name: "__시험보고서", url: "https://example.com/r" }]);
    expect(await store.listAskedTopics(out.conversationKey)).toEqual(["__시험주제"]);
    expect((await client.from("conversations").select("question_count").eq("key", out.conversationKey).single()).data?.question_count).toBe(1);
  });

  it("같은 프로젝트 이름이면 새 프로젝트를 만들지 않고 그 아래에 둔다", async () => {
    const store = createSupabaseNodeStore(client);
    ok(await recordActivities(store, { activities: [{ name: "__시험활동2", projectName: "__시험프로젝트" }] }));
    expect((await client.from("nodes").select("id").eq("name", "__시험프로젝트")).data).toHaveLength(1);
  });

  it("이어붙이기: 잠긴 항목은 건드리지 않고 제안으로 쌓고, 잠기지 않은 항목은 덧붙인다", async () => {
    const store = createSupabaseNodeStore(client);
    const first = ok(await recordActivities(store, { activities: [{ name: "__시험병합", fields: { situation: fld("원래 상황"), action: fld("원래 한 일") } }] }));
    const id = first.results[0].nodeId!;
    // 내가 상황 항목을 고쳐서 잠근 것처럼 만든다
    expect((await client.from("node_fields").update({ text: "내가 고친 상황", locked: true, updated_by: "user" }).eq("node_id", id).eq("field", "situation")).error).toBeNull();
    const out = ok(await recordActivities(store, { conversationKey: first.conversationKey, activities: [{ nodeId: id, fields: { situation: fld("새 상황"), action: fld("추가한 일"), task: fld("새 과제") } }] }));
    expect(out.results[0]).toMatchObject({ status: "updated", fields: { situation: "suggested", action: "appended", task: "set" } });
    const fields = Object.fromEntries((await client.from("node_fields").select("field, text").eq("node_id", id)).data!.map((f) => [f.field, f.text]));
    expect(fields.situation).toBe("내가 고친 상황");
    expect(fields.action).toBe("원래 한 일\n추가한 일");
    expect(fields.task).toBe("새 과제");
    const suggestions = (await client.from("field_suggestions").select("field, text, status, evidence, source_conversation_key").eq("node_id", id)).data!;
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ field: "situation", text: "새 상황", status: "proposed", source_conversation_key: first.conversationKey });
    expect(suggestions[0].evidence).toHaveLength(1);
    // 같은 내용을 또 보내도 제안이 늘지 않는다
    ok(await recordActivities(store, { conversationKey: first.conversationKey, activities: [{ nodeId: id, fields: { situation: fld("새 상황") } }] }));
    expect((await client.from("field_suggestions").select("id").eq("node_id", id)).data).toHaveLength(1);
  });

  it("기간은 잠기지 않았을 때만 넓힌다", async () => {
    const store = createSupabaseNodeStore(client);
    const made = ok(await recordActivities(store, { activities: [{ name: "__시험기간", startDate: "2026-09-01", endDate: "2026-09-10" }] }));
    const id = made.results[0].nodeId!;
    ok(await recordActivities(store, { activities: [{ nodeId: id, endDate: "2026-09-30" }] }));
    expect((await client.from("nodes").select("end_date").eq("id", id).single()).data?.end_date).toBe("2026-09-30");
    await client.from("nodes").update({ locked_fields: ["period"] }).eq("id", id);
    ok(await recordActivities(store, { activities: [{ nodeId: id, endDate: "2026-10-30" }] }));
    expect((await client.from("nodes").select("end_date").eq("id", id).single()).data?.end_date).toBe("2026-09-30");
  });

  it("목록 조회는 이어붙일 활동·위치·질문 정보를 주고 휴지통·제외 노드는 뺀다", async () => {
    const store = createSupabaseNodeStore(client);
    const made = ok(await recordActivities(store, { questionCount: 2, topicKey: "__시험주제2", activities: [{ name: "__시험목록", projectName: "__시험프로젝트", fields: { task: fld("과제") } }] }));
    const id = made.results[0].nodeId!;
    const listed = await listActivities(store, { conversationKey: made.conversationKey });
    if (!listed.ok) throw new Error(listed.errors.join());
    expect(listed.output).toMatchObject({ questionCount: 2, askedTopics: ["__시험주제2"] });
    const mine = listed.output.activities.find((a) => a.id === id)!;
    expect(mine).toMatchObject({ path: "__시험프로젝트 > __시험목록", filledFields: ["task"] });
    expect(listed.output.places.some((p) => p.path === "__시험프로젝트")).toBe(true);
    await client.from("nodes").update({ portfolio_status: "excluded" }).eq("id", id);
    const after = await listActivities(store, {});
    expect(after.ok && after.output.activities.some((a) => a.id === id)).toBe(false);
    await client.from("nodes").update({ portfolio_status: "candidate" }).eq("id", id);
    await client.rpc("trash_node", { p_id: id });
    const afterTrash = await listActivities(store, {});
    expect(afterTrash.ok && afterTrash.output.activities.some((a) => a.id === id)).toBe(false);
  });

  it("모르는 대화 키·잘못된 입력은 거절한다", async () => {
    const store = createSupabaseNodeStore(client);
    expect((await recordActivities(store, { conversationKey: "00000000-0000-4000-8000-000000000000", activities: [] })).ok).toBe(false);
    expect((await listActivities(store, { conversationKey: "00000000-0000-4000-8000-000000000000" })).ok).toBe(false);
    expect((await recordActivities(store, { questionCount: 4, activities: [] })).ok).toBe(false);
  });
});
