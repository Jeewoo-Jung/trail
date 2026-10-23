// 진짜 Supabase(내 계정 로그인)에서 노드·활동 카드 편집이 실제로 동작하는지 시험한다. (PLAN 34번)
// 시험 데이터는 이름이 __시험으로 시작하고 끝에 그것만 지운다. 실행: npm run test:integration
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addEvidence, addOutput, createNode, mergeActivities, moveNode, purgeNode, removeEvidence, removeOutput, resolveSuggestion, restoreNode, setFieldLock, setResultState, setFieldSubject, setFieldText, splitActivity, trashNode, unlockNodeField, updateEvidence, updateNode, updateOutput } from "./node-edit";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TRAIL_LOGIN_EMAIL;
const password = process.env.TRAIL_LOGIN_PASSWORD;
const enabled = Boolean(url && key && email && password);
const ZERO = "00000000-0000-4000-8000-000000000000";
const ev = (excerpt = "원문") => ({ conversationTitle: "__시험 대화", conversationDate: "2026-10-01", excerpt });

describe.skipIf(!enabled)("노드·활동 카드 편집 (실제 로그인으로 시험)", () => {
  let client: SupabaseClient;
  const make = async (name: string, kind: string, parentId: string | null = null) => {
    const r = await createNode(client, { parentId, kind, name: `__시험${name}` });
    if (!r.ok || !r.id) throw new Error(`만들기 실패: ${r.ok ? "" : r.message}`);
    return r.id;
  };
  const row = async (id: string) => (await client.from("nodes").select("*").eq("id", id).single()).data!;
  const fieldsOf = async (id: string) => Object.fromEntries((await client.from("node_fields").select("field, text, subject, locked, updated_by").eq("node_id", id)).data!.map((f) => [f.field, f]));

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("로그인하지 못했습니다.");
  });
  afterAll(async () => {
    if (!client) return;
    await client.from("nodes").delete().like("name", "\\_\\_시험%");
    await client.auth.signOut({ scope: "local" });
  });

  it("노드를 만들 때 종류·이름·위치 규칙을 지킨다", async () => {
    const proj = await make("프로젝트", "project");
    const act = await make("활동", "activity", proj);
    expect((await row(act)).created_by).toBe("user");
    expect(await createNode(client, { parentId: proj, kind: "project", name: "__시험나쁨" })).toMatchObject({ ok: false });
    expect(await createNode(client, { parentId: proj, kind: "activity", name: "  " })).toMatchObject({ ok: false });
    expect(await createNode(client, { parentId: ZERO, kind: "activity", name: "__시험고아" })).toMatchObject({ ok: false });
    expect(await createNode(client, { parentId: null, kind: "subactivity", name: "__시험맨위세부" })).toMatchObject({ ok: false });
    expect(await createNode(client, { parentId: act, kind: "subactivity", name: "__시험세부", startDate: "2026-02-01", endDate: "2026-01-01" })).toMatchObject({ ok: false });
  });

  it("고친 필드는 잠기고, 잠금을 풀 수 있고, 바뀐 것이 없으면 잠그지 않는다", async () => {
    const id = await make("수정", "activity");
    expect(await updateNode(client, id, { name: "__시험수정" })).toEqual({ ok: true });
    expect((await row(id)).locked_fields).toEqual([]);
    expect(await updateNode(client, id, { name: "__시험새이름", description: "설명", startDate: "2026-09-01", endDate: "2026-09-30", portfolioStatus: "needs_work" })).toEqual({ ok: true });
    const r = await row(id);
    expect(r).toMatchObject({ name: "__시험새이름", description: "설명", start_date: "2026-09-01", end_date: "2026-09-30", portfolio_status: "needs_work" });
    expect([...r.locked_fields].sort()).toEqual(["description", "name", "period", "portfolio_status"]);
    expect(await updateNode(client, id, { startDate: "" })).toEqual({ ok: true });
    expect((await row(id)).start_date).toBeNull();
    expect(await unlockNodeField(client, id, "name")).toEqual({ ok: true });
    expect((await row(id)).locked_fields).not.toContain("name");
    expect(await updateNode(client, id, { name: "가".repeat(61) })).toMatchObject({ ok: false });
    expect(await updateNode(client, id, { portfolioStatus: "public" })).toMatchObject({ ok: false });
    expect(await updateNode(client, ZERO, { name: "x" })).toMatchObject({ ok: false });
  });

  it("종류 바꾸기는 부모·자식·항목 규칙을 지킨다", async () => {
    const proj = await make("종류프로젝트", "project");
    const act = await make("종류활동", "activity", proj);
    const sub = await make("종류세부", "subactivity", act);
    expect(await updateNode(client, act, { kind: "study" })).toMatchObject({ ok: false }); // 아래에 세부활동이 있음
    expect(await updateNode(client, sub, { kind: "activity" })).toMatchObject({ ok: false }); // 활동 아래에 활동은 안 됨
    await removeAll(sub);
    await setFieldText(client, act, "task", "과제", "did");
    expect(await updateNode(client, act, { kind: "study" })).toMatchObject({ ok: false }); // 항목이 있음
    await setFieldText(client, act, "task", "", "did");
    expect(await updateNode(client, act, { kind: "study" })).toEqual({ ok: true });
    expect((await row(act)).locked_fields).toContain("kind");
  });
  async function removeAll(id: string) { await client.from("nodes").delete().eq("id", id); }

  it("노드를 옮기면 잠기고, 순환·종류 오류는 막는다", async () => {
    const c1 = await make("범주1", "category");
    const c2 = await make("범주2", "category");
    const proj = await make("이동프로젝트", "project", c1);
    const act = await make("이동활동", "activity", proj);
    expect(await moveNode(client, proj, c2)).toEqual({ ok: true });
    expect((await row(proj)).parent_id).toBe(c2);
    expect((await row(proj)).locked_fields).toContain("parent");
    expect(await moveNode(client, c2, act)).toMatchObject({ ok: false });
    expect(await moveNode(client, c2, c2)).toMatchObject({ ok: false });
    expect(await moveNode(client, act, null)).toEqual({ ok: true }); // 활동은 맨 위에도 둘 수 있다
    expect(await moveNode(client, proj, act)).toMatchObject({ ok: false });
    expect(await moveNode(client, ZERO, c1)).toMatchObject({ ok: false });
  });

  it("휴지통: 보내고, 복구하고, 완전히 지운다(휴지통에 있는 것만)", async () => {
    const proj = await make("휴지통프로젝트", "project");
    const act = await make("휴지통활동", "activity", proj);
    const t = await trashNode(client, proj);
    expect(t).toMatchObject({ ok: true });
    expect(await trashNode(client, proj)).toMatchObject({ ok: false });
    expect(await restoreNode(client, act)).toMatchObject({ ok: false, message: expect.stringContaining("상위 노드") });
    expect(await purgeNode(client, ZERO)).toMatchObject({ ok: false });
    expect(await restoreNode(client, proj)).toEqual({ ok: true });
    expect((await row(act)).deleted_at).toBeNull();
    expect(await purgeNode(client, act)).toMatchObject({ ok: false }); // 휴지통에 없으면 지우지 않는다
    await trashNode(client, act);
    expect(await purgeNode(client, act)).toEqual({ ok: true });
    expect((await client.from("nodes").select("id").eq("id", act)).data).toHaveLength(0);
  });

  it("항목을 쓰면 잠기고(내 수정), 비우면 항목과 근거가 지워진다. 주체와 잠금도 바꾼다", async () => {
    const id = await make("항목", "activity");
    expect(await setFieldText(client, id, "situation", "내가 쓴 상황", "did")).toEqual({ ok: true });
    expect((await fieldsOf(id)).situation).toMatchObject({ text: "내가 쓴 상황", subject: "did", locked: true, updated_by: "user" });
    expect(await setFieldSubject(client, id, "situation", "estimate")).toEqual({ ok: true });
    expect((await fieldsOf(id)).situation.subject).toBe("estimate");
    expect(await setFieldLock(client, id, "situation", false)).toEqual({ ok: true });
    expect((await fieldsOf(id)).situation.locked).toBe(false);
    expect(await setFieldText(client, id, "result_external", "합격", "did")).toEqual({ ok: true });
    expect(await setFieldText(client, id, "task", "가".repeat(201), "did")).toMatchObject({ ok: false });
    expect(await setFieldText(client, id, "bad", "x", "did")).toMatchObject({ ok: false });
    expect(await setFieldText(client, id, "task", "x", "robot")).toMatchObject({ ok: false });
    expect(await setFieldSubject(client, id, "action", "did")).toMatchObject({ ok: false }); // 내용이 없는 항목
    expect(await addEvidence(client, id, "situation", ev())).toEqual({ ok: true });
    expect(await setFieldText(client, id, "situation", "  ", "did")).toEqual({ ok: true });
    expect((await fieldsOf(id)).situation).toBeUndefined();
    expect((await client.from("evidence").select("id").eq("node_id", id).eq("field", "situation")).data).toHaveLength(0);
    const proj = await make("항목프로젝트", "project");
    expect(await setFieldText(client, proj, "task", "x", "did")).toMatchObject({ ok: false }); // 프로젝트에는 항목이 없다
  });

  it("근거를 붙이고 고치고 지운다(항목당 3개, 내용 있는 항목에만)", async () => {
    const id = await make("근거", "activity");
    expect(await addEvidence(client, id, "action", ev())).toMatchObject({ ok: false }); // 내용 없는 항목
    await setFieldText(client, id, "action", "한 일", "did");
    for (let i = 0; i < 3; i += 1) expect(await addEvidence(client, id, "action", ev(`발췌${i}`))).toEqual({ ok: true });
    expect(await addEvidence(client, id, "action", ev("넷"))).toMatchObject({ ok: false, message: expect.stringContaining("3개") });
    expect(await addEvidence(client, id, "action", { ...ev(), conversationDate: "어제" })).toMatchObject({ ok: false });
    const list = (await client.from("evidence").select("id, excerpt").eq("node_id", id)).data!;
    expect(await updateEvidence(client, list[0].id, ev("고친 발췌"))).toEqual({ ok: true });
    expect((await client.from("evidence").select("excerpt").eq("id", list[0].id).single()).data?.excerpt).toBe("고친 발췌");
    expect(await updateEvidence(client, ZERO, ev())).toMatchObject({ ok: false });
    expect(await removeEvidence(client, list[1].id)).toEqual({ ok: true });
    expect(await addEvidence(client, id, "action", ev("다시"))).toEqual({ ok: true });
  });

  it("필드 제안: 덧붙이기·바꾸기는 내 수정(잠금)으로, 거절은 제안만 닫는다", async () => {
    const id = await make("제안", "activity");
    await setFieldText(client, id, "action", "내가 쓴 글", "did");
    const add = async (text: string, evidence = [ev("제안 근거")]) => (await client.from("field_suggestions").insert({ node_id: id, field: "action", text, subject: "claude_unconfirmed", evidence }).select("id").single()).data!.id as string;
    const s1 = await add("새 내용 하나");
    expect(await resolveSuggestion(client, s1, "append")).toEqual({ ok: true });
    expect((await fieldsOf(id)).action).toMatchObject({ text: "내가 쓴 글\n새 내용 하나", subject: "claude_unconfirmed", locked: true });
    expect((await client.from("evidence").select("id").eq("node_id", id).eq("field", "action")).data).toHaveLength(1);
    expect((await client.from("field_suggestions").select("status").eq("id", s1).single()).data?.status).toBe("accepted");
    expect(await resolveSuggestion(client, s1, "append")).toMatchObject({ ok: false }); // 이미 처리됨
    const s2 = await add("통째로 바꿀 내용");
    expect(await resolveSuggestion(client, s2, "replace")).toEqual({ ok: true });
    expect((await fieldsOf(id)).action.text).toBe("통째로 바꿀 내용");
    const s3 = await add("거절할 내용");
    expect(await resolveSuggestion(client, s3, "reject")).toEqual({ ok: true });
    expect((await fieldsOf(id)).action.text).toBe("통째로 바꿀 내용");
    expect((await client.from("field_suggestions").select("status").eq("id", s3).single()).data?.status).toBe("rejected");
    await setFieldText(client, id, "action", "가".repeat(495), "did");
    const s4 = await add("나".repeat(20));
    expect(await resolveSuggestion(client, s4, "append")).toMatchObject({ ok: false, message: expect.stringContaining("한도") });
    expect((await client.from("field_suggestions").select("status").eq("id", s4).single()).data?.status).toBe("proposed");
    expect(await resolveSuggestion(client, ZERO, "reject")).toMatchObject({ ok: false });
  });

  it("산출물을 더하고 고치고 지운다(링크는 http(s)만, 노드당 20개)", async () => {
    const id = await make("산출물", "activity");
    expect(await addOutput(client, id, { name: "보고서", url: "https://example.com/r", isFinal: true })).toEqual({ ok: true });
    expect(await addOutput(client, id, { name: " " })).toMatchObject({ ok: false });
    expect(await addOutput(client, id, { name: "나쁜 링크", url: "javascript:alert(1)" })).toMatchObject({ ok: false });
    const o = (await client.from("outputs").select("id, name, url, is_final").eq("node_id", id)).data!;
    expect(o).toEqual([expect.objectContaining({ name: "보고서", url: "https://example.com/r", is_final: true })]);
    expect(await updateOutput(client, o[0].id, { name: "고친 이름", url: "", isFinal: false })).toEqual({ ok: true });
    expect((await client.from("outputs").select("name, url, is_final").eq("id", o[0].id).single()).data).toEqual({ name: "고친 이름", url: null, is_final: false });
    for (let i = 1; i < 20; i += 1) await addOutput(client, id, { name: `산출${i}` });
    expect(await addOutput(client, id, { name: "스물한 번째" })).toMatchObject({ ok: false });
    expect(await removeOutput(client, o[0].id)).toEqual({ ok: true, storagePath: null });
    expect(await addOutput(client, id, { name: "다시" })).toEqual({ ok: true });
  });

  it("결과 상태: 외부 결과나 최종 산출물이 생기면 채워짐, 사라지면 비어 있음으로 돌아가고, 나중에·해당 없음은 채워진 활동에는 못 쓴다", async () => {
    const id = await make("결과활동", "activity");
    expect((await row(id)).result_state).toBe("empty");
    expect(await setResultState(client, id, "snooze", 3, new Date("2026-10-30T00:00:00Z"))).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ result_state: "snoozed", result_snooze_until: "2026-11-02T00:00:00+00:00" });
    expect(await setResultState(client, id, "not_applicable", 3)).toEqual({ ok: true });
    expect((await row(id)).result_state).toBe("not_applicable");
    expect(await setResultState(client, id, "reset", 3)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ result_state: "empty", result_snooze_until: null });
    await setFieldText(client, id, "result_external", "1차 합격", "did");
    expect((await row(id)).result_state).toBe("filled");
    expect(await setResultState(client, id, "snooze", 3)).toMatchObject({ ok: false });
    await setFieldText(client, id, "result_external", "", "did");
    expect((await row(id)).result_state).toBe("empty");
    expect(await addOutput(client, id, { name: "일반 산출물" })).toEqual({ ok: true });
    expect((await row(id)).result_state).toBe("empty"); // 최종이 아니면 결과로 보지 않는다
    expect(await addOutput(client, id, { name: "최종본", isFinal: true })).toEqual({ ok: true });
    expect((await row(id)).result_state).toBe("filled");
    const finals = (await client.from("outputs").select("id").eq("node_id", id).eq("is_final", true)).data!;
    expect(await removeOutput(client, finals[0].id)).toMatchObject({ ok: true, storagePath: null });
    expect((await row(id)).result_state).toBe("empty");
    expect(await setResultState(client, ZERO, "snooze", 3)).toMatchObject({ ok: false });
  });

  it("첨부 파일 경로는 내 id·이 노드 id 폴더 아래의 파일 하나만 받고, 지운 산출물의 경로를 돌려준다", async () => {
    const id = await make("첨부활동", "activity");
    const other = await make("첨부다른활동", "activity");
    const { data: me } = await client.auth.getUser();
    const uid = me.user!.id;
    const good = `${uid}/${id}/abc-보고서.pdf`;
    expect(await addOutput(client, id, { name: "보고서.pdf", storagePath: good, isFinal: true }, uid)).toEqual({ ok: true });
    for (const bad of [`${uid}/${other}/x.pdf`, `${ZERO}/${id}/x.pdf`, `${uid}/${id}/a/b.pdf`, `${uid}/${id}/../x.pdf`, "x.pdf"]) {
      expect(await addOutput(client, id, { name: "나쁜 경로", storagePath: bad }, uid)).toMatchObject({ ok: false });
    }
    expect(await addOutput(client, id, { name: "사용자 id 없음", storagePath: good })).toMatchObject({ ok: false });
    const o = (await client.from("outputs").select("id, storage_path").eq("node_id", id)).data!;
    expect(o).toHaveLength(1);
    expect(await removeOutput(client, o[0].id)).toEqual({ ok: true, storagePath: good });
    expect(await removeOutput(client, o[0].id)).toMatchObject({ ok: false });
  });

  it("결과 상태만 바꾸는 일(나중에·해당 없음)은 '마지막 기록' 시각을 갱신하지 않고, 이름 같은 내용 수정은 갱신한다", async () => {
    const id = await make("시각활동", "activity");
    const t0 = (await row(id)).updated_at as string;
    await new Promise((r) => setTimeout(r, 1100));
    expect(await setResultState(client, id, "snooze", 3)).toEqual({ ok: true });
    expect(await setResultState(client, id, "not_applicable", 3)).toEqual({ ok: true });
    expect((await row(id)).updated_at).toBe(t0);
    expect(await updateNode(client, id, { description: "고침" })).toEqual({ ok: true });
    expect(Date.parse((await row(id)).updated_at)).toBeGreaterThan(Date.parse(t0));
  });

  it("항목을 비우면 '비움'이 기억되고(AI가 다시 채우지 못함), 다시 쓰면 풀린다", async () => {
    const id = await make("비움활동", "activity");
    await setFieldText(client, id, "situation", "쓴 내용", "did");
    expect((await row(id)).cleared_fields).toEqual([]);
    await setFieldText(client, id, "situation", "", "did");
    expect((await row(id)).cleared_fields).toEqual(["situation"]);
    expect((await fieldsOf(id)).situation).toBeUndefined();
    await setFieldText(client, id, "situation", "다시 씀", "did");
    expect((await row(id)).cleared_fields).toEqual([]);
  });

  it("쪼개기·합치기로 외부 결과가 옮겨지면 두 활동의 결과 상태가 실제에 맞게 다시 계산된다", async () => {
    const proj = await make("결과쪼개기프로젝트", "project");
    const a = await make("결과쪼갤활동", "activity", proj);
    await setFieldText(client, a, "result_external", "1차 합격", "did");
    await setFieldText(client, a, "action", "한 일", "did");
    expect((await row(a)).result_state).toBe("filled");
    const split = await splitActivity(client, a, "__시험결과받는활동", ["result_external"], []);
    expect(split).toMatchObject({ ok: true });
    const b = (split as { id: string }).id;
    expect((await row(a)).result_state).toBe("empty");
    expect((await row(b)).result_state).toBe("filled");
    expect(await mergeActivities(client, a, b)).toMatchObject({ ok: true });
    expect((await row(a)).result_state).toBe("filled");
  });

  it("산출물 링크는 데이터베이스에서도 http(s)만 받는다", async () => {
    const id = await make("링크활동", "activity");
    expect((await client.from("outputs").insert({ node_id: id, name: "나쁨", url: "javascript:alert(1)" })).error).not.toBeNull();
    expect((await client.from("outputs").insert({ node_id: id, name: "좋음", url: "https://example.com/a" })).error).toBeNull();
    expect((await client.from("outputs").insert({ node_id: id, name: "공백", url: "https://example.com/a b" })).error).not.toBeNull();
  });

  it("완전히 지우면 산출물에 붙은 첨부 파일도 Storage에서 지운다", async () => {
    const id = await make("파일활동", "activity");
    const { data: me } = await client.auth.getUser();
    const uid = me.user!.id;
    const path = `${uid}/${id}/${crypto.randomUUID()}-test.txt`;
    expect((await client.storage.from("trail-files").upload(path, new Blob(["가상 내용"]))).error).toBeNull();
    expect(await addOutput(client, id, { name: "test.txt", storagePath: path }, uid)).toEqual({ ok: true });
    expect((await client.storage.from("trail-files").download(path)).error).toBeNull();
    await trashNode(client, id);
    expect(await purgeNode(client, id)).toEqual({ ok: true });
    expect((await client.storage.from("trail-files").download(path)).error).not.toBeNull();
  });

  it("합치기: 항목은 이어 붙이고, 근거·산출물·세부활동을 옮기며, 합친 쪽은 휴지통에 간다", async () => {
    const proj = await make("합치기프로젝트", "project");
    const a = await make("합칠A", "activity", proj);
    const b = await make("합칠B", "activity", proj);
    const sub = await make("B의세부", "subactivity", b);
    await updateNode(client, a, { startDate: "2026-09-10", endDate: "2026-09-20" });
    await updateNode(client, b, { startDate: "2026-09-01", endDate: "2026-09-30" });
    await setFieldText(client, a, "action", "A가 한 일", "did");
    await setFieldText(client, b, "action", "B가 한 일", "plan");
    await setFieldText(client, b, "task", "B의 과제", "did");
    await addEvidence(client, a, "action", ev("a1"));
    await addEvidence(client, a, "action", ev("a2"));
    await addEvidence(client, b, "action", ev("b1"));
    await addEvidence(client, b, "action", ev("b2"));
    await addOutput(client, b, { name: "B의 산출물" });
    expect(await mergeActivities(client, a, a)).toMatchObject({ ok: false });
    expect(await mergeActivities(client, a, proj)).toMatchObject({ ok: false });
    expect(await mergeActivities(client, a, b)).toMatchObject({ ok: true });
    const f = await fieldsOf(a);
    expect(f.action).toMatchObject({ text: "A가 한 일\nB가 한 일", subject: "did" });
    expect(f.task.text).toBe("B의 과제");
    expect((await client.from("evidence").select("id").eq("node_id", a).eq("field", "action")).data).toHaveLength(3); // 3개까지만 옮긴다
    expect((await client.from("outputs").select("name").eq("node_id", a)).data).toEqual([{ name: "B의 산출물" }]);
    expect((await row(sub)).parent_id).toBe(a);
    expect(await row(a)).toMatchObject({ start_date: "2026-09-01", end_date: "2026-09-30" });
    expect((await row(b)).deleted_at).not.toBeNull();
    expect(await mergeActivities(client, a, b)).toMatchObject({ ok: false }); // 이미 휴지통
  });

  it("합치기는 한도를 넘거나, 위아래 관계이거나, 종류가 다르면 막는다", async () => {
    const proj = await make("합치기막기프로젝트", "project");
    const a = await make("막A", "activity", proj);
    const b = await make("막B", "activity", proj);
    await setFieldText(client, a, "task", "가".repeat(150), "did");
    await setFieldText(client, b, "task", "나".repeat(100), "did");
    expect(await mergeActivities(client, a, b)).toMatchObject({ ok: false, message: expect.stringContaining("한도") });
    expect((await fieldsOf(a)).task.text).toHaveLength(150);
    expect((await row(b)).deleted_at).toBeNull(); // 반쪽 적용 없음
    const sub = await make("막세부", "subactivity", a);
    expect(await mergeActivities(client, a, sub)).toMatchObject({ ok: false });
    const s2 = await make("막세부2", "subactivity", b);
    expect(await mergeActivities(client, sub, s2)).toMatchObject({ ok: true }); // 같은 종류의 세부활동끼리는 된다
    const study = await make("막학습", "study", proj);
    expect(await mergeActivities(client, a, study)).toMatchObject({ ok: false });
  });

  it("쪼개기: 고른 항목·세부활동을 같은 부모 아래 새 활동으로 옮긴다", async () => {
    const proj = await make("쪼개기프로젝트", "project");
    const a = await make("쪼갤활동", "activity", proj);
    const s1 = await make("쪼갤세부1", "subactivity", a);
    const s2 = await make("쪼갤세부2", "subactivity", a);
    await setFieldText(client, a, "situation", "상황", "did");
    await setFieldText(client, a, "action", "한 일", "did");
    await addEvidence(client, a, "action", ev("한 일 근거"));
    const split = await splitActivity(client, a, "__시험쪼갠활동", ["action"], [s1]);
    expect(split).toMatchObject({ ok: true });
    const newId = (split as { id: string }).id;
    expect(await row(newId)).toMatchObject({ parent_id: proj, kind: "activity", name: "__시험쪼갠활동", created_by: "user" });
    expect(Object.keys(await fieldsOf(a))).toEqual(["situation"]);
    expect(Object.keys(await fieldsOf(newId))).toEqual(["action"]);
    expect((await client.from("evidence").select("id").eq("node_id", newId).eq("field", "action")).data).toHaveLength(1);
    expect((await row(s1)).parent_id).toBe(newId);
    expect((await row(s2)).parent_id).toBe(a);
    expect(await splitActivity(client, a, "__시험빈쪼개기", [], [])).toMatchObject({ ok: false });
    expect(await splitActivity(client, a, "  ", ["situation"], [])).toMatchObject({ ok: false });
    expect(await splitActivity(client, ZERO, "__시험없음", ["situation"], [])).toMatchObject({ ok: false });
  });

  it("로그인하지 않은 연결로는 합치기·쪼개기를 쓸 수 없다", async () => {
    const anon = createClient(url!, key!);
    expect((await anon.rpc("merge_activities", { p_keep: ZERO, p_other: ZERO })).error).not.toBeNull();
    expect((await anon.rpc("split_activity", { p_id: ZERO, p_name: "x", p_fields: [], p_children: [] })).error).not.toBeNull();
  });
});
