import { describe, expect, it } from "vitest";
import { buildNodeTree, flatten } from "../rules/node-tree";
import { checkField, documentNodeIds, hasStar, refsOnly } from "./sample-check";
import { SAMPLE_NODE_DATA as d } from "./sample-nodes";

describe("샘플 데이터", () => {
  it("규칙(종류별 부모·STAR 한도·근거 수)을 지키는 가상 데이터다", () => {
    const tree = buildNodeTree(d);
    expect(flatten(tree.roots).length).toBe(d.nodes.length);
    for (const n of d.nodes) expect(hasStar(n.kind) || !d.fields.some((f) => f.nodeId === n.id)).toBe(true);
    for (const f of d.fields) expect(checkField({ field: f.field, text: f.text, subject: f.subject }, "user").ok).toBe(true);
    for (const f of d.fields) expect(d.evidence.filter((e) => e.nodeId === f.nodeId && e.field === f.field).length).toBeLessThanOrEqual(3);
  });
  it("제외된 가지는 문서 노드에서 빠진다", () => {
    const ids = documentNodeIds(refsOnly(d.nodes));
    expect(ids).not.toContain("s-p3");
    expect(ids).not.toContain("s-a4");
    expect(ids).toContain("s-a1");
  });
  it("실제 기관명·사람 이름처럼 보이는 것을 넣지 않는다(가상 표시)", () => {
    const all = JSON.stringify(d);
    expect(all).toContain("가상");
  });
});
