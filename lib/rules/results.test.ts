import { describe, expect, it } from "vitest";
import { chatPendingResults, filledResultIds, groupRootId, isHidden, lastRecordMs, pendingResults, snoozeUntil, type ResultNode } from "./results";

const NOW = new Date("2026-10-30T00:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const n = (id: string, parentId: string | null, kind: ResultNode["kind"], over: Partial<ResultNode> = {}): ResultNode => ({ id, parentId, kind, name: id, portfolioStatus: "candidate", deletedAt: null, updatedAt: ago(30), resultState: "empty", resultSnoozeUntil: null, resultAskedAt: null, ...over });

describe("filledResultIds", () => {
  it("외부 결과 글이 있거나 최종 산출물이 있으면 채워진 것이다(빈 글·최종 아닌 산출물은 아니다)", () => {
    const ids = filledResultIds(
      [{ nodeId: "a", field: "result_external", text: "합격", updatedAt: "" }, { nodeId: "b", field: "result_external", text: "  ", updatedAt: "" }, { nodeId: "c", field: "result_conversation", text: "대화 결과", updatedAt: "" }],
      [{ nodeId: "d", isFinal: true }, { nodeId: "e", isFinal: false }],
    );
    expect([...ids].sort()).toEqual(["a", "d"]);
  });
});

describe("isHidden", () => {
  it("해당 없음은 항상, 나중에는 기간 안에서만 숨긴다", () => {
    expect(isHidden(n("a", null, "activity", { resultState: "not_applicable" }), NOW.getTime())).toBe(true);
    expect(isHidden(n("a", null, "activity", { resultState: "snoozed", resultSnoozeUntil: snoozeUntil(NOW, 3) }), NOW.getTime())).toBe(true);
    expect(isHidden(n("a", null, "activity", { resultState: "snoozed", resultSnoozeUntil: ago(1) }), NOW.getTime())).toBe(false);
    expect(isHidden(n("a", null, "activity", { resultState: "snoozed", resultSnoozeUntil: null }), NOW.getTime())).toBe(false);
    expect(isHidden(n("a", null, "activity"), NOW.getTime())).toBe(false);
  });
});

describe("groupRootId / lastRecordMs", () => {
  const nodes = [n("c", null, "category"), n("p", "c", "project", { updatedAt: ago(20) }), n("a", "p", "activity", { updatedAt: ago(15) }), n("lone", null, "activity")];
  it("가장 가까운 프로젝트 조상, 없으면 자기 자신", () => {
    expect(groupRootId(nodes, "a")).toBe("p");
    expect(groupRootId(nodes, "lone")).toBe("lone");
  });
  it("프로젝트 아래의 노드·항목 중 가장 최근 시각을 센다", () => {
    expect(lastRecordMs(nodes, [], "p")).toBe(Date.parse(ago(15)));
    expect(lastRecordMs(nodes, [{ nodeId: "a", field: "task", text: "x", updatedAt: ago(2) }], "p")).toBe(Date.parse(ago(2)));
    expect(lastRecordMs(nodes, [{ nodeId: "lone", field: "task", text: "x", updatedAt: ago(1) }], "p")).toBe(Date.parse(ago(15)));
  });
});

describe("pendingResults (앱의 결과 등록 대기)", () => {
  const base = { fields: [], outputs: [], now: NOW, waitDays: 7 };
  it("프로젝트에 대기 일수를 넘게 새 기록이 없고 결과가 비어 있는 활동이 나온다", () => {
    const nodes = [n("p", null, "project", { updatedAt: ago(20) }), n("a", "p", "activity", { updatedAt: ago(10) }), n("b", "p", "activity", { updatedAt: ago(40) })];
    expect(pendingResults({ ...base, nodes }).map((r) => [r.nodeId, r.daysSince])).toEqual([["a", 10], ["b", 10]]);
  });
  it("같은 프로젝트의 다른 활동에 최근 기록이 있으면 모두 기다리지 않는다", () => {
    const nodes = [n("p", null, "project"), n("a", "p", "activity", { updatedAt: ago(30) }), n("b", "p", "activity", { updatedAt: ago(1) })];
    expect(pendingResults({ ...base, nodes })).toEqual([]);
  });
  it("대기 일수와 같은 날이면 아직 아니고, 하루 넘으면 나온다", () => {
    expect(pendingResults({ ...base, nodes: [n("a", null, "activity", { updatedAt: ago(7) })] })).toEqual([]);
    expect(pendingResults({ ...base, nodes: [n("a", null, "activity", { updatedAt: ago(8) })] })).toHaveLength(1);
    expect(pendingResults({ ...base, waitDays: 14, nodes: [n("a", null, "activity", { updatedAt: ago(10) })] })).toEqual([]);
  });
  it("결과가 채워졌거나 숨김이거나 제외·휴지통이거나 활동이 아니면 나오지 않는다", () => {
    const nodes = [
      n("filled", null, "activity"), n("na", null, "activity", { resultState: "not_applicable" }), n("snz", null, "activity", { resultState: "snoozed", resultSnoozeUntil: snoozeUntil(NOW, 2) }),
      n("ex", null, "activity", { portfolioStatus: "excluded" }), n("tr", null, "activity", { deletedAt: ago(1) }), n("proj", null, "project"), n("study", null, "study"),
      n("ok", null, "activity"),
    ];
    const r = pendingResults({ ...base, nodes, fields: [{ nodeId: "filled", field: "result_external", text: "합격", updatedAt: ago(30) }] });
    expect(r.map((x) => x.nodeId)).toEqual(["ok"]);
  });
  it("숨김 기간이 지나면 다시 나온다", () => {
    expect(pendingResults({ ...base, nodes: [n("a", null, "activity", { resultState: "snoozed", resultSnoozeUntil: ago(1) })] })).toHaveLength(1);
  });
  it("세부활동은 따로 세지 않는다", () => {
    const nodes = [n("a", null, "activity", { resultState: "not_applicable" }), n("s", "a", "subactivity")];
    expect(pendingResults({ ...base, nodes })).toEqual([]);
  });
});

describe("chatPendingResults (Claude 채팅)", () => {
  it("결과가 비어 있고 숨김이 아닌 활동을 돌려주며, 이미 물은 활동은 표시한다(대기 일수와 무관)", () => {
    const nodes = [n("a", null, "activity", { updatedAt: ago(0) }), n("asked", null, "activity", { resultAskedAt: ago(3) }), n("done", null, "activity"), n("na", null, "activity", { resultState: "not_applicable" })];
    expect(chatPendingResults({ nodes, filledIds: new Set(["done"]), now: NOW })).toEqual([{ nodeId: "a", askedBefore: false }, { nodeId: "asked", askedBefore: true }]);
  });
});
