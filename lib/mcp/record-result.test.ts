import { describe, expect, it } from "vitest";
import { STAR_LIMITS } from "../rules/limits";
import { MASK } from "../rules/mask-secrets";
import { FakeNodeStore } from "./fake-node-store";
import { recordResult, type RecordResultOutput } from "./record-result";

const ok = (r: Awaited<ReturnType<typeof recordResult>>): RecordResultOutput => {
  if (!r.ok) throw new Error(r.errors.join(","));
  return r.output;
};

describe("recordResult", () => {
  it("사용자가 말한 외부 결과를 비어 있는 칸에 저장하고(작성자 ai, 잠기지 않음), 상태를 채워짐으로 바꾼다", async () => {
    const store = new FakeNodeStore();
    const a = store.addNode({ kind: "activity", name: "활동" });
    const out = ok(await recordResult(store, { nodeId: a.id, action: "save", text: "  1차 합격  " }));
    expect(out).toMatchObject({ status: "saved", textSaved: true });
    expect(store.fields.get(a.id)?.get("result_external")).toMatchObject({ text: "1차 합격", locked: false, updatedBy: "ai" });
    expect(a.resultState).toBe("filled");
    expect([...(await store.listResultFilledNodeIds())]).toEqual([a.id]);
  });
  it("이미 있는 외부 결과(앱에서 고쳐 잠근 것 포함)는 채팅으로 덮어쓰지 않고 제안으로만 쌓는다", async () => {
    const store = new FakeNodeStore();
    const a = store.addNode({ kind: "activity", name: "활동" });
    store.setField(a.id, "result_external", "내가 쓴 결과", true);
    const out = ok(await recordResult(store, { nodeId: a.id, action: "save", text: "다른 결과" }));
    expect(out).toMatchObject({ status: "saved", suggested: true, textSaved: false });
    expect(store.fields.get(a.id)?.get("result_external")?.text).toBe("내가 쓴 결과");
    expect(store.suggestions).toMatchObject([{ field: "result_external", text: "다른 결과" }]);
    expect(ok(await recordResult(store, { nodeId: a.id, action: "save", text: "내가 쓴 결과" })).suggested).toBeUndefined(); // 같은 내용이면 제안도 만들지 않는다
    expect(store.suggestions).toHaveLength(1);
  });
  it("이미 결과가 있는 활동은 해당 없음으로 바꿀 수 없고, 세부활동의 결과는 받지 않는다", async () => {
    const store = new FakeNodeStore();
    const a = store.addNode({ kind: "activity", name: "활동" });
    store.setField(a.id, "result_external", "합격", true);
    expect(ok(await recordResult(store, { nodeId: a.id, action: "not_applicable" })).status).toBe("rejected");
    const s = store.addNode({ kind: "subactivity", name: "세부", parentId: a.id });
    expect(ok(await recordResult(store, { nodeId: s.id, action: "save", text: "x" })).status).toBe("rejected");
  });
  it("산출물은 최종으로 저장하고 링크는 http(s)만, 같은 것은 중복 없이 받는다", async () => {
    const store = new FakeNodeStore();
    const a = store.addNode({ kind: "activity", name: "활동" });
    const out = ok(await recordResult(store, { nodeId: a.id, action: "save", outputs: [{ name: "최종본", url: "https://example.com/f" }, { name: "최종본", url: "https://example.com/f" }, { name: "나쁨", url: "ftp://x" }] }));
    expect(out).toMatchObject({ status: "saved", outputsAdded: 1, textSaved: false });
    expect(out.notes).toHaveLength(1);
    expect(store.finals.has(a.id)).toBe(true);
    expect([...(await store.listResultFilledNodeIds())]).toEqual([a.id]);
  });
  it("글도 산출물도 없으면 저장하지 않고, 한도를 넘는 글은 거절한다", async () => {
    const store = new FakeNodeStore();
    const a = store.addNode({ kind: "activity", name: "활동" });
    expect(ok(await recordResult(store, { nodeId: a.id, action: "save", text: "  " })).status).toBe("rejected");
    expect(ok(await recordResult(store, { nodeId: a.id, action: "save", text: "가".repeat(STAR_LIMITS.result_external + 1) })).status).toBe("rejected");
    expect(a.resultState).toBe("empty");
  });
  it("해당 없음·질문함 표시는 상태만 바꾸고 내용은 건드리지 않는다", async () => {
    const store = new FakeNodeStore();
    const a = store.addNode({ kind: "activity", name: "활동" });
    expect(ok(await recordResult(store, { nodeId: a.id, action: "asked" }))).toMatchObject({ status: "marked" });
    expect(a.resultAskedAt).not.toBeNull();
    expect(ok(await recordResult(store, { nodeId: a.id, action: "not_applicable" }))).toMatchObject({ status: "marked" });
    expect(a.resultState).toBe("not_applicable");
    expect(store.fields.get(a.id)).toBeUndefined();
  });
  it("없는·휴지통·프로젝트·제외된 노드는 거절한다", async () => {
    const store = new FakeNodeStore();
    const trashed = store.addNode({ kind: "activity", name: "휴지통", deletedAt: "2026-10-01" });
    const project = store.addNode({ kind: "project", name: "P" });
    const excluded = store.addNode({ kind: "activity", name: "제외", portfolioStatus: "excluded" });
    for (const id of [trashed.id, project.id, excluded.id, "00000000-0000-4000-8000-000000000000"]) expect(ok(await recordResult(store, { nodeId: id, action: "save", text: "결과" })).status).toBe("rejected");
  });
  it("키 모양은 가려서 저장하고, 잘못된 입력은 거절한다", async () => {
    const store = new FakeNodeStore();
    const a = store.addNode({ kind: "activity", name: "활동" });
    ok(await recordResult(store, { nodeId: a.id, action: "save", text: "키 sk-ant-api03-abcdefghijklmnopqrstuvwx 포함" }));
    expect(store.fields.get(a.id)?.get("result_external")?.text).toContain(MASK);
    expect((await recordResult(store, { nodeId: "abc", action: "save" })).ok).toBe(false);
    expect((await recordResult(store, { nodeId: a.id, action: "delete" })).ok).toBe(false);
  });
});
