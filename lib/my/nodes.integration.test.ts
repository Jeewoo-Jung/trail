// 진짜 Supabase(내 계정 로그인)에서 노드·활동 카드 표의 권한과 안전망(순환·단계·한도·휴지통)이 실제로 동작하는지 시험한다. (PLAN 32번)
// 시험 데이터는 이름이 __시험으로 시작하고 끝에 그것만 지운다(없는 표라 내 데이터는 없다). 실행: npm run test:integration
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TRAIL_LOGIN_EMAIL;
const password = process.env.TRAIL_LOGIN_PASSWORD;
const enabled = Boolean(url && key && email && password);
const ZERO = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!enabled)("노드·활동 카드 표 (실제 로그인으로 시험)", () => {
  let client: SupabaseClient;
  let userId = "";
  const conversations: string[] = [];

  const add = async (name: string, kind: string, parentId: string | null = null, extra: Record<string, unknown> = {}) => {
    const { data, error } = await client.from("nodes").insert({ name: `__시험${name}`, kind, parent_id: parentId, ...extra }).select("id").single();
    return { id: data?.id as string, error };
  };
  const get = async (id: string) => (await client.from("nodes").select("*").eq("id", id).single()).data!;

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { data, error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error("로그인하지 못했습니다.");
    userId = data.user.id;
  });
  afterAll(async () => {
    if (!client) return;
    await client.from("nodes").delete().like("name", "\\_\\_시험%");
    if (conversations.length) await client.from("conversations").delete().in("key", conversations);
    await client.auth.signOut({ scope: "local" });
  });

  it("노드를 만들고 종류·이름·기간·상태 안전망이 걸려 있다", async () => {
    const root = await add("루트", "category");
    expect(root.error).toBeNull();
    const row = await get(root.id);
    expect(row).toMatchObject({ portfolio_status: "candidate", locked_fields: [], result_state: "empty", created_by: "user", deleted_at: null, user_id: userId });
    expect((await add("나쁜종류", "folder")).error).not.toBeNull();
    expect((await client.from("nodes").insert({ name: "   ", kind: "category" })).error).not.toBeNull();
    expect((await client.from("nodes").insert({ name: "가".repeat(61), kind: "category" })).error).not.toBeNull();
    expect((await add("나쁜기간", "category", null, { start_date: "2026-02-01", end_date: "2026-01-01" })).error).not.toBeNull();
    expect((await add("나쁜상태", "category", null, { portfolio_status: "public" })).error).not.toBeNull();
    expect((await add("나쁜잠금", "category", null, { locked_fields: ["secret"] })).error).not.toBeNull();
    expect((await add("좋은잠금", "category", null, { locked_fields: ["name", "period"] })).error).toBeNull();
  });

  it("부모는 내 노드여야 하고, 순환과 너무 깊은 단계를 막는다", async () => {
    expect((await add("고아", "project", ZERO)).error).not.toBeNull();
    const a = await add("A", "category");
    const b = await add("B", "category", a.id);
    const c = await add("C", "category", b.id);
    expect((await client.from("nodes").update({ parent_id: c.id }).eq("id", a.id)).error?.message).toMatch(/node_cycle/);
    expect((await client.from("nodes").update({ parent_id: a.id }).eq("id", a.id)).error?.message).toMatch(/node_cycle/);
    // 8단계까지는 되고 9단계는 막힌다
    let parent = c.id; // 3단계
    for (let depth = 4; depth <= 8; depth += 1) parent = (await add(`깊${depth}`, "category", parent)).id;
    expect((await add("깊9", "category", parent)).error?.message).toMatch(/node_too_deep/);
  });

  it("STAR 항목은 항목별 글자 수 한도를 지키고 같은 항목은 하나뿐이다", async () => {
    const act = await add("활동", "activity");
    const limits: Record<string, number> = { situation: 300, task: 200, action: 500, result_conversation: 300, result_external: 300 };
    for (const [field, limit] of Object.entries(limits)) {
      expect((await client.from("node_fields").insert({ node_id: act.id, field, text: "가".repeat(limit), subject: "did" })).error).toBeNull();
      expect((await client.from("node_fields").update({ text: "가".repeat(limit + 1) }).eq("node_id", act.id).eq("field", field)).error).not.toBeNull();
    }
    expect((await client.from("node_fields").insert({ node_id: act.id, field: "task", text: "또", subject: "did" })).error?.code).toBe("23505");
    expect((await client.from("node_fields").insert({ node_id: act.id, field: "bad", text: "x", subject: "did" })).error).not.toBeNull();
    const other = await add("활동2", "activity");
    expect((await client.from("node_fields").insert({ node_id: other.id, field: "task", text: "x", subject: "robot" })).error).not.toBeNull();
    expect((await client.from("node_fields").insert({ node_id: other.id, field: "task", text: "  ", subject: "did" })).error).not.toBeNull();
    expect((await client.from("node_fields").insert({ node_id: ZERO, field: "task", text: "x", subject: "did" })).error).not.toBeNull();
  });

  it("근거는 항목당 3개까지, 발췌는 300자까지다", async () => {
    const act = await add("근거활동", "activity");
    const ev = (n: number, excerpt = "원문") => ({ node_id: act.id, field: "action", conversation_title: `제목${n}`, conversation_date: "2026-10-01", excerpt });
    for (let i = 1; i <= 3; i += 1) expect((await client.from("evidence").insert(ev(i))).error).toBeNull();
    expect((await client.from("evidence").insert(ev(4))).error?.message).toMatch(/evidence_limit/);
    expect((await client.from("evidence").insert({ ...ev(5), field: "task", excerpt: "가".repeat(301) })).error).not.toBeNull();
    expect((await client.from("evidence").insert({ ...ev(6), field: "task", conversation_date: "어제" })).error).not.toBeNull();
    expect((await client.from("evidence").insert({ ...ev(7), field: "task" })).error).toBeNull(); // 다른 항목은 따로 센다
  });

  it("산출물·필드 제안·묶기 제안·주제 질문 기록을 저장하고 한도를 지킨다", async () => {
    const act = await add("산출활동", "activity");
    expect((await client.from("outputs").insert({ node_id: act.id, name: "보고서", url: "https://example.com/a", is_final: true })).error).toBeNull();
    expect((await client.from("outputs").insert({ node_id: act.id, name: " " })).error).not.toBeNull();
    expect((await client.from("field_suggestions").insert({ node_id: act.id, field: "action", text: "제안", subject: "estimate" })).error).toBeNull();
    expect((await client.from("field_suggestions").insert({ node_id: act.id, field: "action", text: "x", subject: "estimate", status: "maybe" })).error).not.toBeNull();
    const a = await add("묶A", "activity");
    const b = await add("묶B", "activity");
    const sig = `__시험-${a.id}-${b.id}`;
    expect((await client.from("group_proposals").insert({ child_node_ids: [a.id, b.id], suggested_name: "__시험새프로젝트", suggested_kind: "project", signature: sig })).error).toBeNull();
    expect((await client.from("group_proposals").insert({ child_node_ids: [a.id, b.id], suggested_name: "__시험새프로젝트", suggested_kind: "project", signature: sig })).error?.code).toBe("23505");
    expect((await client.from("group_proposals").insert({ child_node_ids: [a.id], suggested_name: "x", suggested_kind: "project", signature: `${sig}2` })).error).not.toBeNull();
    await client.from("group_proposals").delete().like("signature", "\\_\\_시험%");

    const conv = (await client.from("conversations").insert({}).select("key").single()).data!.key as string;
    conversations.push(conv);
    expect((await client.from("topic_questions").insert({ conversation_key: conv, topic_key: "주제A" })).error).toBeNull();
    expect((await client.from("topic_questions").insert({ conversation_key: conv, topic_key: "주제A" })).error?.code).toBe("23505");
    expect((await client.from("conversations").update({ question_count: 3 }).eq("key", conv)).error).toBeNull();
    expect((await client.from("conversations").update({ question_count: 4 }).eq("key", conv)).error).not.toBeNull();
  });

  it("휴지통: 아래 가지와 함께 넣고, 같은 시각의 것만 복구하며, 부모가 휴지통이면 복구하지 못한다", async () => {
    const p = await add("휴지부모", "project");
    const a1 = await add("휴지활동1", "activity", p.id);
    const a2 = await add("휴지활동2", "activity", p.id);
    // a2는 먼저 따로 휴지통에 넣어 둔다(나중에 부모를 복구해도 a2는 돌아오지 않아야 한다)
    expect((await client.rpc("trash_node", { p_id: a2.id })).data).toBe(1);
    const moved = await client.rpc("trash_node", { p_id: p.id });
    expect(moved.data).toBe(2); // p, a1
    expect((await get(a1.id)).deleted_at).not.toBeNull();
    expect((await client.rpc("trash_node", { p_id: p.id })).error?.message).toMatch(/node_not_found/);
    // 자식만 먼저 복구하려 하면 부모가 휴지통이라 막힌다
    expect((await client.rpc("restore_node", { p_id: a1.id })).error?.message).toMatch(/parent_trashed/);
    expect((await client.rpc("restore_node", { p_id: p.id })).data).toBe(2);
    expect((await get(p.id)).deleted_at).toBeNull();
    expect((await get(a1.id)).deleted_at).toBeNull();
    expect((await get(a2.id)).deleted_at).not.toBeNull();
    expect((await client.rpc("restore_node", { p_id: a2.id })).data).toBe(1);
    expect((await client.rpc("restore_node", { p_id: a2.id })).error?.message).toMatch(/node_not_found/);
    expect((await client.rpc("trash_node", { p_id: ZERO })).error).not.toBeNull();
  });

  it("부모를 완전히 지우면 아래 가지·항목·근거가 함께 지워진다", async () => {
    const p = await add("지울부모", "project");
    const a = await add("지울활동", "activity", p.id);
    await client.from("node_fields").insert({ node_id: a.id, field: "task", text: "x", subject: "did" });
    await client.from("evidence").insert({ node_id: a.id, field: "task", conversation_title: "t", conversation_date: "2026-10-01", excerpt: "e" });
    expect((await client.from("nodes").delete().eq("id", p.id)).error).toBeNull();
    expect((await client.from("nodes").select("id").eq("id", a.id)).data).toHaveLength(0);
    expect((await client.from("node_fields").select("node_id").eq("node_id", a.id)).data).toHaveLength(0);
    expect((await client.from("evidence").select("id").eq("node_id", a.id)).data).toHaveLength(0);
  });

  it("남의 번호로는 만들 수 없고, 로그인하지 않은 연결로는 읽거나 쓸 수 없다", async () => {
    expect((await client.from("nodes").insert({ user_id: ZERO, name: "__시험남의것", kind: "category" })).error).not.toBeNull();
    const anon = createClient(url!, key!);
    for (const table of ["nodes", "node_fields", "evidence", "outputs", "field_suggestions", "group_proposals", "topic_questions"]) {
      expect((await anon.from(table).select("*").limit(1)).error, table).not.toBeNull();
    }
    expect((await anon.from("nodes").insert({ name: "__시험익명", kind: "category" })).error).not.toBeNull();
    expect((await anon.rpc("trash_node", { p_id: ZERO })).error).not.toBeNull();
  });

  it("설정의 결과 등록 기간은 범위를 지킨다", async () => {
    const before = (await client.from("settings").select("result_wait_days, result_snooze_days").maybeSingle()).data;
    expect(before === null || (before.result_wait_days === 7 && before.result_snooze_days === 3)).toBe(true);
    expect((await client.from("settings").update({ result_wait_days: 0 }).eq("user_id", userId)).error).not.toBeNull();
    expect((await client.from("settings").update({ result_snooze_days: 91 }).eq("user_id", userId)).error).not.toBeNull();
  });
});
