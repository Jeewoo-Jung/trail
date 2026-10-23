import { describe, expect, it } from "vitest";
import { EMPTY_DATA, type NodeData, type NodeRow } from "../rules/node-tree";
import { buildExportResponse } from "./export-response";

const NOW = new Date("2026-10-30T00:00:00Z");
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const P = id(1), A = id(2), X = id(3);
let order = 0;
const node = (nid: string, parentId: string | null, kind: NodeRow["kind"], name: string, over: Partial<NodeRow> = {}): NodeRow => ({ id: nid, parentId, kind, name, description: "", startDate: null, endDate: null, portfolioStatus: "candidate", lockedFields: [], resultState: "empty", resultSnoozeUntil: null, resultAskedAt: null, sortOrder: (order += 1), createdBy: "user", deletedAt: null, updatedAt: "2026-10-01", ...over });
const data: NodeData = {
  ...EMPTY_DATA,
  nodes: [node(P, null, "project", "가상 데이터 공모전"), node(A, P, "activity", "검색 평가 세트 만들기"), node(X, null, "project", "보류 중인 가상 프로젝트", { portfolioStatus: "excluded" })],
  fields: [{ nodeId: A, field: "action", text: "평가 세트를 만들었다", subject: "did", locked: false, updatedBy: "ai", updatedAt: "2026-10-01" }],
};

describe("buildExportResponse", () => {
  it("프로젝트 단위 Markdown: 첨부 파일처럼 내려받게 하고 한글 이름은 UTF-8 이름으로 준다", async () => {
    const res = buildExportResponse(data, P, "md", NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const disposition = res.headers.get("content-disposition")!;
    expect(disposition).toContain('filename="trail-star-2026-10-30.md"');
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent("가상 데이터 공모전-2026-10-30.md")}`);
    const text = await res.text();
    expect(text).toContain("# 가상 데이터 공모전");
    expect(text).toContain("검색 평가 세트 만들기");
  });
  it("활동 단위 JSON, 전체(all) 기본값", async () => {
    const one = JSON.parse(await buildExportResponse(data, A, "json", NOW).text());
    expect(one.root.name).toBe("검색 평가 세트 만들기");
    const all = JSON.parse(await buildExportResponse(data, null, "json", NOW).text());
    expect(all.root.name).toBe("Trail 전체 기록");
    expect(JSON.stringify(all)).not.toContain("보류 중인 가상 프로젝트"); // 제외 노드는 전체에서도 빠진다
  });
  it("잘못된 입력과 내려받을 수 없는 노드를 거절한다", () => {
    expect(buildExportResponse(data, P, "pdf", NOW).status).toBe(400);
    expect(buildExportResponse(data, P, null, NOW).status).toBe(400);
    expect(buildExportResponse(data, "not-a-uuid", "md", NOW).status).toBe(400);
    expect(buildExportResponse(data, "00000000-0000-4000-8000-000000000000", "md", NOW).status).toBe(404);
  });
});
