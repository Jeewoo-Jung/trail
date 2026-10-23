// 진짜 Supabase(내 계정 로그인)에서 상향식 묶기 제안의 생성·승인·거절이 실제로 동작하는지 시험한다. (PLAN 36번)
// 기본은 가짜 자문역이고, ANTHROPIC_API_KEY가 있으면 진짜 Claude 호출을 한 번만 시험한다. 시험 데이터는 이름이 __시험으로 시작하고 끝에 그것만 지운다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClaudeGroupAdvisor, type GroupAdvisor } from "../claude/group-advisor";
import { approveGroupProposal, generateGroupProposals, rejectGroupProposal } from "./group-proposals";
import { createNode, moveNode } from "./node-edit";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TRAIL_LOGIN_EMAIL;
const password = process.env.TRAIL_LOGIN_PASSWORD;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const enabled = Boolean(url && key && email && password);
const ZERO = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!enabled)("상향식 묶기 제안 (실제 로그인으로 시험)", () => {
  let client: SupabaseClient;
  const ids: string[] = [];
  const row = async (id: string) => (await client.from("nodes").select("*").eq("id", id).single()).data!;
  const pending = async () => (await client.from("group_proposals").select("id, child_node_ids, suggested_name, suggested_kind, status").like("suggested_name", "\\_\\_시험%").order("created_at")).data!;
  /** 자문역이 항상 같은 두 묶음을 제안하는 가짜 */
  const fake: GroupAdvisor = async ({ bucket }) => {
    const mine = bucket.nodes.filter((n) => ids.includes(n.id)).map((n) => n.id);
    return { groups: [{ ids: mine.slice(0, 2), name: "__시험묶음A" }, { ids: mine.slice(2, 4), name: "__시험묶음B" }] };
  };

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("로그인하지 못했습니다.");
    // 기준보다 적을 때는 제안하지 않는다
    for (let i = 0; i < 3; i += 1) {
      const r = await createNode(client, { parentId: null, kind: "activity", name: `__시험활동${i}` });
      if (r.ok && r.id) ids.push(r.id);
    }
  });
  afterAll(async () => {
    if (!client) return;
    await client.from("group_proposals").delete().like("suggested_name", "\\_\\_시험%");
    await client.from("nodes").delete().like("name", "\\_\\_시험%");
    await client.auth.signOut({ scope: "local" });
  });

  it("같은 위치·종류의 노드가 기준(4개)보다 적으면 Claude를 부르지 않고 제안하지 않는다", async () => {
    let called = 0;
    const counting: GroupAdvisor = async (i) => { called += 1; return fake(i); };
    expect(await generateGroupProposals(client, counting)).toEqual({ created: 0, skipped: "no-candidates" });
    expect(called).toBe(0);
  });

  it("기준을 채우면 제안을 만들고, 같은 제안은 다시 만들지 않는다", async () => {
    for (let i = 3; i < 5; i += 1) {
      const r = await createNode(client, { parentId: null, kind: "activity", name: `__시험활동${i}` });
      if (r.ok && r.id) ids.push(r.id);
    }
    const first = await generateGroupProposals(client, fake);
    expect(first.created).toBe(2);
    const list = await pending();
    expect(list.map((p) => [p.suggested_name, p.suggested_kind, p.status])).toEqual([["__시험묶음A", "project", "proposed"], ["__시험묶음B", "project", "proposed"]]);
    // 대기 중인 제안에 든 노드는 후보에서 빠져, 남은 노드가 기준 미달이면 새 제안이 없다
    expect(await generateGroupProposals(client, fake)).toMatchObject({ created: 0 });
    expect(await pending()).toHaveLength(2);
  });

  it("승인하면 새 상위 노드가 만들어지고 노드들이 그 아래로 옮겨진다(이름을 고쳐서 승인할 수도 있다)", async () => {
    const [a] = await pending();
    const res = await approveGroupProposal(client, a.id, "  __시험고친이름  ");
    expect(res).toMatchObject({ ok: true });
    const parent = await row((res as { id: string }).id);
    expect(parent).toMatchObject({ kind: "project", name: "__시험고친이름", parent_id: null, created_by: "ai" });
    for (const c of a.child_node_ids as string[]) expect((await row(c)).parent_id).toBe(parent.id);
    expect(await approveGroupProposal(client, a.id, "x")).toMatchObject({ ok: false }); // 이미 처리됨
    expect((await client.from("group_proposals").select("status").eq("id", a.id).single()).data?.status).toBe("approved");
  });

  it("그새 노드가 옮겨졌으면 승인되지 않고, 거절하면 같은 묶음을 다시 제안하지 않는다", async () => {
    const [b] = (await pending()).filter((p) => p.status === "proposed");
    const proj = await createNode(client, { parentId: null, kind: "project", name: "__시험다른곳" });
    expect(await moveNode(client, (b.child_node_ids as string[])[0], (proj as { id: string }).id)).toEqual({ ok: true });
    expect(await approveGroupProposal(client, b.id, "")).toMatchObject({ ok: false, message: expect.stringContaining("바뀌었") });
    expect(await rejectGroupProposal(client, b.id)).toEqual({ ok: true });
    expect(await rejectGroupProposal(client, b.id)).toMatchObject({ ok: false });
    expect(await approveGroupProposal(client, ZERO, "")).toMatchObject({ ok: false });
  });

  it("이름이 규칙에 어긋나면 승인하지 않는다", async () => {
    const extra: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await createNode(client, { parentId: null, kind: "project", name: `__시험프로젝트${i}` });
      if (r.ok && r.id) extra.push(r.id);
    }
    const advisor: GroupAdvisor = async ({ bucket }) => ({ groups: [{ ids: bucket.nodes.filter((n) => extra.includes(n.id)).slice(0, 2).map((n) => n.id), name: "__시험새범주" }] });
    expect(await generateGroupProposals(client, advisor)).toMatchObject({ created: 1 });
    const p = (await pending()).find((x) => x.suggested_name === "__시험새범주")!;
    expect(p.suggested_kind).toBe("category");
    expect(await approveGroupProposal(client, p.id, "가".repeat(61))).toMatchObject({ ok: false });
    expect(await approveGroupProposal(client, p.id, "")).toMatchObject({ ok: true }); // 이름을 비우면 제안 이름을 쓴다
  });

  it("자문역이 실패하면 제안을 만들지 않고 오류를 그대로 알린다", async () => {
    const extra: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await createNode(client, { parentId: null, kind: "category", name: `__시험범주${i}` });
      if (r.ok && r.id) extra.push(r.id);
    }
    const before = (await pending()).length;
    await expect(generateGroupProposals(client, async () => { throw new Error("한도"); })).rejects.toThrow();
    expect(await pending()).toHaveLength(before);
  });

  it.skipIf(!anthropicKey)("진짜 Claude가 규칙에 맞는 모양으로 답한다(제안이 몇 개든 오류 없이 끝난다)", async () => {
    const r = await generateGroupProposals(client, createClaudeGroupAdvisor(anthropicKey!));
    expect(["no-candidates", null]).toContain(r.skipped);
    expect(r.created).toBeGreaterThanOrEqual(0);
  });
});
