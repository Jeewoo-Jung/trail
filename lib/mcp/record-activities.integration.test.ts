// 진짜 Supabase(내 계정 로그인)에서 활동 기록·병합·목록 조회가 끝까지 동작하는지 시험한다. (PLAN 33번)
// 시험 데이터는 이름이 __시험으로 시작하고 끝에 그것만 지운다. 실행: npm run test:integration
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listActivities } from "./list-activities";
import { recordActivities, type RecordOutput } from "./record-activities";
import { recordResult } from "./record-result";
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

  it("결과 저장: 결과가 비어 있는 활동을 알려 주고, 질문함 표시·사용자가 말한 결과·해당 없음이 같은 칸에 저장된다", async () => {
    const store = createSupabaseNodeStore(client);
    const made = ok(await recordActivities(store, { activities: [{ name: "__시험결과활동" }, { name: "__시험결과활동2" }] }));
    const [a, b] = made.results.map((r) => r.nodeId!);
    const before = await listActivities(store, {});
    if (!before.ok) throw new Error();
    expect(before.output.resultsPending.filter((r) => [a, b].includes(r.id)).map((r) => r.askedBefore)).toEqual([false, false]);

    expect(await recordResult(store, { nodeId: a, action: "asked" })).toMatchObject({ ok: true, output: { status: "marked" } });
    const asked = await listActivities(store, {});
    expect(asked.ok && asked.output.resultsPending.find((r) => r.id === a)?.askedBefore).toBe(true);

    expect(await recordResult(store, { nodeId: a, action: "save", text: "1차 합격", outputs: [{ name: "__시험최종본", url: "https://example.com/final" }] })).toMatchObject({ ok: true, output: { status: "saved", textSaved: true, outputsAdded: 1 } });
    const f = (await client.from("node_fields").select("text, subject, locked, updated_by").eq("node_id", a).eq("field", "result_external").single()).data!;
    expect(f).toMatchObject({ text: "1차 합격", locked: false, updated_by: "ai" });
    expect((await client.from("outputs").select("name, is_final").eq("node_id", a)).data).toEqual([{ name: "__시험최종본", is_final: true }]);
    expect((await client.from("nodes").select("result_state").eq("id", a).single()).data?.result_state).toBe("filled");

    expect(await recordResult(store, { nodeId: b, action: "not_applicable" })).toMatchObject({ ok: true });
    const after = await listActivities(store, {});
    expect(after.ok && after.output.resultsPending.some((r) => [a, b].includes(r.id))).toBe(false);
    expect(await recordResult(store, { nodeId: "00000000-0000-4000-8000-000000000000", action: "save", text: "x" })).toMatchObject({ ok: true, output: { status: "rejected" } });
  });

  it("내가 비운 항목은 AI 기록이 다시 채우지 않고 제안으로 쌓는다(실제 저장소)", async () => {
    const store = createSupabaseNodeStore(client);
    const made = ok(await recordActivities(store, { activities: [{ name: "__시험비움", fields: { situation: fld("처음 상황") } }] }));
    const id = made.results[0].nodeId!;
    await client.from("node_fields").delete().eq("node_id", id).eq("field", "situation");
    await client.from("nodes").update({ cleared_fields: ["situation"] }).eq("id", id);
    const out = ok(await recordActivities(store, { activities: [{ nodeId: id, fields: { situation: fld("새 상황"), task: fld("과제") } }] }));
    expect(out.results[0].fields).toEqual({ situation: "suggested", task: "set" });
    expect((await client.from("node_fields").select("field").eq("node_id", id)).data!.map((f) => f.field)).toEqual(["task"]);
    expect((await client.from("field_suggestions").select("field, text").eq("node_id", id)).data).toEqual([{ field: "situation", text: "새 상황" }]);
  });

  it("주체가 다른 내용은 덧붙이지 않고 제안으로 돌리며, 이미 있는 결과는 채팅으로 덮어쓰지 않는다(실제 저장소)", async () => {
    const store = createSupabaseNodeStore(client);
    const made = ok(await recordActivities(store, { activities: [{ name: "__시험주체", fields: { action: fld("한 일", "did") } }] }));
    const id = made.results[0].nodeId!;
    const out = ok(await recordActivities(store, { activities: [{ nodeId: id, fields: { action: fld("추정 내용", "estimate") } }] }));
    expect(out.results[0].fields).toEqual({ action: "suggested" });
    expect((await client.from("node_fields").select("text, subject").eq("node_id", id).eq("field", "action").single()).data).toEqual({ text: "한 일", subject: "did" });
    expect(await recordResult(store, { nodeId: id, action: "save", text: "첫 결과" })).toMatchObject({ ok: true, output: { status: "saved", textSaved: true } });
    expect((await client.from("node_fields").select("updated_by, locked").eq("node_id", id).eq("field", "result_external").single()).data).toEqual({ updated_by: "ai", locked: false });
    expect(await recordResult(store, { nodeId: id, action: "save", text: "바꾸려는 결과" })).toMatchObject({ ok: true, output: { status: "saved", suggested: true, textSaved: false } });
    expect((await client.from("node_fields").select("text").eq("node_id", id).eq("field", "result_external").single()).data?.text).toBe("첫 결과");
    expect((await client.from("field_suggestions").select("text").eq("node_id", id).eq("field", "result_external")).data).toEqual([{ text: "바꾸려는 결과" }]);
  });

  it("'기록하지 않기'처럼 활동이 없어도 질문한 주제와 횟수가 저장된다", async () => {
    const store = createSupabaseNodeStore(client);
    const out = ok(await recordActivities(store, { questionCount: 2, topicKey: "__시험거절주제", activities: [] }));
    expect(await store.listAskedTopics(out.conversationKey)).toEqual(["__시험거절주제"]);
    expect((await client.from("conversations").select("question_count").eq("key", out.conversationKey).single()).data?.question_count).toBe(2);
  });

  it("모르는 대화 키·잘못된 입력은 거절한다", async () => {
    const store = createSupabaseNodeStore(client);
    expect((await recordActivities(store, { conversationKey: "00000000-0000-4000-8000-000000000000", activities: [] })).ok).toBe(false);
    expect((await listActivities(store, { conversationKey: "00000000-0000-4000-8000-000000000000" })).ok).toBe(false);
    expect((await recordActivities(store, { questionCount: 4, activities: [] })).ok).toBe(false);
  });
});
