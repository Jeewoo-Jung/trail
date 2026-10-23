import { describe, expect, it } from "vitest";
import { STAR_LIMITS } from "../rules/limits";
import { MASK } from "../rules/mask-secrets";
import { FakeNodeStore } from "./fake-node-store";
import { listActivities } from "./list-activities";
import { recordActivities, type RecordOutput } from "./record-activities";

const ev = (excerpt = "원문 발췌") => ({ conversationTitle: "대화 제목", conversationDate: "2026-10-01", excerpt });
const fld = (text: string, subject = "did", evidence = [ev()]) => ({ text, subject, evidence });
const ok = (r: Awaited<ReturnType<typeof recordActivities>>): RecordOutput => {
  if (!r.ok) throw new Error(r.errors.join(","));
  return r.output;
};

describe("recordActivities: 새 활동 만들기", () => {
  it("프로젝트 이름이 있으면 프로젝트를 만들고 그 아래에 활동을 만든다", async () => {
    const store = new FakeNodeStore();
    const out = ok(await recordActivities(store, { activities: [{ name: "공모전 기획", projectName: "내 프로젝트", startDate: "2026-09-01", fields: { situation: fld("공모전이 있었다"), action: fld("기획서를 썼다") } }] }));
    expect(out.results[0]).toMatchObject({ status: "created", name: "공모전 기획", fields: { situation: "set", action: "set" }, notes: ["프로젝트를 새로 만들었습니다."] });
    const project = store.nodes.find((n) => n.kind === "project")!;
    const activity = store.nodes.find((n) => n.kind === "activity")!;
    expect(project.name).toBe("내 프로젝트");
    expect(activity).toMatchObject({ parentId: project.id, startDate: "2026-09-01" });
    expect(store.evidence.get(`${activity.id}|situation`)).toHaveLength(1);
  });
  it("같은 이름(공백·대소문자 무시)의 프로젝트가 있으면 새로 만들지 않고 쓴다", async () => {
    const store = new FakeNodeStore();
    const p = store.addNode({ kind: "project", name: "My Project" });
    ok(await recordActivities(store, { activities: [{ name: "활동", projectName: "my  project" }] }));
    expect(store.nodes.filter((n) => n.kind === "project")).toHaveLength(1);
    expect(store.nodes.find((n) => n.kind === "activity")!.parentId).toBe(p.id);
  });
  it("위치가 없으면 맨 위에, parentId가 있으면 그 아래에 둔다. 규칙에 어긋나는 위치는 거절한다", async () => {
    const store = new FakeNodeStore();
    const proj = store.addNode({ kind: "project", name: "P" });
    const act = store.addNode({ kind: "activity", name: "A", parentId: proj.id });
    const out = ok(await recordActivities(store, { activities: [
      { name: "맨 위 활동" },
      { name: "아래 활동", parentId: proj.id },
      { name: "세부", kind: "subactivity", parentId: act.id },
      { name: "나쁜 세부", kind: "subactivity", parentId: proj.id },
      { name: "없는 부모", parentId: "00000000-0000-4000-8000-000000000000" },
    ] }));
    expect(out.results.map((r) => r.status)).toEqual(["created", "created", "created", "rejected", "rejected"]);
  });
  it("이름이 없거나 형식이 틀린 활동은 거절하고 나머지는 저장한다", async () => {
    const store = new FakeNodeStore();
    const out = ok(await recordActivities(store, { activities: [{ projectName: "x" }, { name: "좋은 활동" }, "문자열", { name: "가".repeat(61) }] }));
    expect(out.results.map((r) => r.status)).toEqual(["rejected", "created", "rejected", "rejected"]);
  });
});

describe("recordActivities: 항목(STAR)과 근거", () => {
  it("근거가 없는 항목은 비워 두고(dropped) 이유를 알리며, 외부 결과 칸은 받지 않는다", async () => {
    const store = new FakeNodeStore();
    const out = ok(await recordActivities(store, { activities: [{ name: "활동", fields: { situation: fld("근거 없음", "did", []), task: fld("과제") , result_external: fld("합격") } }] }));
    expect(out.results[0].fields).toEqual({ situation: "dropped", task: "set" });
    expect(out.results[0].notes?.[0]).toContain("근거가 없어");
    const node = store.nodes.find((n) => n.kind === "activity")!;
    expect(store.fields.get(node.id)?.has("situation")).toBeFalsy();
    expect(store.fields.get(node.id)?.has("result_external")).toBeFalsy();
  });
  it("항목별 글자 수 한도를 넘으면 그 항목만 버린다", async () => {
    const store = new FakeNodeStore();
    const out = ok(await recordActivities(store, { activities: [{ name: "활동", fields: { task: fld("가".repeat(STAR_LIMITS.task + 1)), action: fld("가".repeat(STAR_LIMITS.action)) } }] }));
    expect(out.results[0].fields).toEqual({ task: "dropped", action: "set" });
  });
  it("키·토큰 모양은 가려서 저장한다(이름·항목·근거·산출물)", async () => {
    const store = new FakeNodeStore();
    const secret = "sk-ant-api03-abcdefghijklmnopqrstuvwx";
    ok(await recordActivities(store, { activities: [{ name: `활동 ${secret}`, fields: { action: fld(`키는 ${secret} 이다`, "did", [ev(`발췌 ${secret}`)]) }, outputs: [{ name: `산출 ${secret}` }] }] }));
    const node = store.nodes.find((n) => n.kind === "activity")!;
    const dump = JSON.stringify([node, [...(store.fields.get(node.id)?.values() ?? [])], [...store.evidence.values()], [...store.outputs.values()]]);
    expect(dump).not.toContain(secret);
    expect(dump).toContain(MASK);
  });
});

describe("recordActivities: 기존 활동에 이어붙이기(병합)", () => {
  it("잠긴 항목은 그대로 두고 제안으로 쌓고, 잠기지 않은 항목은 덧붙이며, 비어 있는 항목은 채운다", async () => {
    const store = new FakeNodeStore();
    const node = store.addNode({ kind: "activity", name: "활동" });
    store.setField(node.id, "situation", "내가 고친 상황", true);
    store.setField(node.id, "action", "기존에 한 일", false);
    const out = ok(await recordActivities(store, { activities: [{ nodeId: node.id, fields: { situation: fld("새 상황 내용"), action: fld("추가로 한 일"), task: fld("새 과제") } }] }));
    expect(out.results[0]).toMatchObject({ status: "updated", fields: { situation: "suggested", action: "appended", task: "set" } });
    expect(store.fields.get(node.id)?.get("situation")?.text).toBe("내가 고친 상황");
    expect(store.fields.get(node.id)?.get("action")?.text).toBe("기존에 한 일\n추가로 한 일");
    expect(store.suggestions).toHaveLength(1);
    expect(store.suggestions[0]).toMatchObject({ field: "situation", text: "새 상황 내용" });
  });
  it("같은 제안은 다시 쌓지 않고, 이미 있는 내용은 건너뛴다", async () => {
    const store = new FakeNodeStore();
    const node = store.addNode({ kind: "activity", name: "활동" });
    store.setField(node.id, "situation", "고친 상황", true);
    store.setField(node.id, "task", "기존 과제 전체", false);
    const body = { activities: [{ nodeId: node.id, fields: { situation: fld("새 상황"), task: fld("기존 과제") } }] };
    ok(await recordActivities(store, body));
    const again = ok(await recordActivities(store, body));
    expect(store.suggestions).toHaveLength(1);
    expect(again.results[0].fields).toEqual({ situation: "skipped", task: "skipped" });
  });
  it("근거는 항목당 3개까지만 붙인다", async () => {
    const store = new FakeNodeStore();
    const node = store.addNode({ kind: "activity", name: "활동" });
    ok(await recordActivities(store, { activities: [{ nodeId: node.id, fields: { action: fld("1", "did", [ev("a"), ev("b")]) } }] }));
    ok(await recordActivities(store, { activities: [{ nodeId: node.id, fields: { action: fld("2", "did", [ev("c"), ev("d")]) } }] }));
    expect(store.evidence.get(`${node.id}|action`)).toHaveLength(3);
  });
  it("없는·휴지통·프로젝트 노드로의 이어붙이기는 거절한다", async () => {
    const store = new FakeNodeStore();
    const trashed = store.addNode({ kind: "activity", name: "휴지통", deletedAt: "2026-10-01" });
    const project = store.addNode({ kind: "project", name: "P" });
    const out = ok(await recordActivities(store, { activities: [{ nodeId: trashed.id }, { nodeId: project.id }, { nodeId: "00000000-0000-4000-8000-000000000000" }] }));
    expect(out.results.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
  });
  it("기간은 잠기지 않았을 때만 넓힌다", async () => {
    const store = new FakeNodeStore();
    const free = store.addNode({ kind: "activity", name: "자유", startDate: "2026-09-01", endDate: "2026-09-10" });
    const locked = store.addNode({ kind: "activity", name: "잠김", startDate: "2026-09-01", endDate: "2026-09-10", lockedFields: ["period"] });
    ok(await recordActivities(store, { activities: [{ nodeId: free.id, endDate: "2026-09-30" }, { nodeId: locked.id, endDate: "2026-09-30" }] }));
    expect(free.endDate).toBe("2026-09-30");
    expect(locked.endDate).toBe("2026-09-10");
  });
});

describe("recordActivities: 산출물·대화·질문", () => {
  it("산출물 링크는 http(s)만, 같은 것은 중복 없이, 한 번에 5개까지", async () => {
    const store = new FakeNodeStore();
    const out = ok(await recordActivities(store, { activities: [{ name: "활동", outputs: [{ name: "보고서", url: "https://example.com/a" }, { name: "보고서", url: "https://example.com/a" }, { name: "나쁜 링크", url: "javascript:alert(1)" }, { name: "링크 없음" }] }] }));
    expect(out.results[0].outputsAdded).toBe(2);
    const node = store.nodes.find((n) => n.kind === "activity")!;
    expect(store.outputs.get(node.id)).toEqual([{ name: "보고서", url: "https://example.com/a" }, { name: "링크 없음", url: null }]);
  });
  it("활동은 한 번에 5개까지, 질문 횟수는 0~3, 대화 키는 uuid", async () => {
    const store = new FakeNodeStore();
    expect((await recordActivities(store, { activities: Array.from({ length: 6 }, () => ({ name: "a" })) })).ok).toBe(false);
    expect((await recordActivities(store, { questionCount: 4, activities: [] })).ok).toBe(false);
    expect((await recordActivities(store, { conversationKey: "abc", activities: [] })).ok).toBe(false);
    expect((await recordActivities(store, { conversationKey: "00000000-0000-4000-8000-000000000000", activities: [] })).ok).toBe(false);
  });
  it("대화 키를 발급하고 질문한 주제를 기록하며, 저장이 하나도 안 되면 주제를 기록하지 않는다", async () => {
    const store = new FakeNodeStore();
    const first = ok(await recordActivities(store, { questionCount: 1, topicKey: "주제A", activities: [{ name: "활동" }] }));
    expect(await store.listAskedTopics(first.conversationKey)).toEqual(["주제A"]);
    const none = ok(await recordActivities(store, { conversationKey: first.conversationKey, topicKey: "주제B", activities: [{ name: "" }] }));
    expect(none.results[0].status).toBe("rejected");
    expect(await store.listAskedTopics(first.conversationKey)).toEqual(["주제A"]);
    expect(store.conversations.get(first.conversationKey)?.questionCount).toBe(1);
  });
  it("저장소 오류는 그 활동만 거절하고 내용이 섞인 메시지를 돌려주지 않는다", async () => {
    const store = new FakeNodeStore();
    store.failOn = "insertNode";
    const out = ok(await recordActivities(store, { activities: [{ name: "비밀 이름 활동" }] }));
    expect(out.results[0]).toEqual({ status: "rejected", reasons: ["저장하지 못했습니다. 잠시 후 다시 시도해 주세요."] });
    expect(JSON.stringify(out)).not.toContain("비밀");
  });
});

describe("listActivities", () => {
  it("이어붙일 활동과 위치 후보를 경로로 돌려주고, 휴지통·제외 노드는 뺀다", async () => {
    const store = new FakeNodeStore();
    const cat = store.addNode({ kind: "category", name: "취업" });
    const proj = store.addNode({ kind: "project", name: "공모전", parentId: cat.id });
    const act = store.addNode({ kind: "activity", name: "기획", parentId: proj.id, lockedFields: ["name"] });
    store.setField(act.id, "situation", "상황", true);
    store.addNode({ kind: "activity", name: "휴지통 활동", parentId: proj.id, deletedAt: "2026-10-01" });
    const excluded = store.addNode({ kind: "project", name: "제외됨", portfolioStatus: "excluded" });
    store.addNode({ kind: "activity", name: "제외 아래", parentId: excluded.id });
    const r = await listActivities(store, {});
    if (!r.ok) throw new Error();
    expect(r.output.activities).toEqual([{ id: act.id, kind: "activity", path: "취업 > 공모전 > 기획", startDate: null, endDate: null, filledFields: ["situation"], lockedFields: ["name", "situation"] }]);
    expect(r.output.places.map((p) => p.path).sort()).toEqual(["취업", "취업 > 공모전", "취업 > 공모전 > 기획"]);
    expect(r.output.questionCount).toBe(0);
  });
  it("대화 키가 있으면 질문 횟수와 질문한 주제를 알려 주고, 모르는 키는 거절한다", async () => {
    const store = new FakeNodeStore();
    const rec = ok(await recordActivities(store, { questionCount: 2, topicKey: "주제A", activities: [{ name: "활동" }] }));
    const r = await listActivities(store, { conversationKey: rec.conversationKey });
    expect(r.ok && r.output).toMatchObject({ questionCount: 2, askedTopics: ["주제A"] });
    expect((await listActivities(store, { conversationKey: "00000000-0000-4000-8000-000000000000" })).ok).toBe(false);
    expect((await listActivities(store, { conversationKey: "abc" })).ok).toBe(false);
  });
});
