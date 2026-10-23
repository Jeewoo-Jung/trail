// Design Ref: DESIGN.md §14.5 — 프로젝트·활동 단위 STAR 문서. 화면(문서 뷰)과 내려받기(Markdown/JSON)가 같은 문서 모델을 쓴다.
//  - 휴지통에 있거나 제외(조상이 제외된 것 포함)된 노드는 자동으로 빠진다.
//  - 비어 있는 항목은 문서에 쓰지 않는다(근거 없이 채우지 않는다는 원칙과 같이, 미입력은 그대로 비워 둔다).
//  - "공개 가능 여부"는 따지지 않는다. 대화에 있는 내용을 그대로 담고, 걸러내는 일은 제출 때 내가 수기로 한다.
import { documentNodeIds, hasStar, NODE_KIND_LABEL, STAR_FIELD_LABEL, STAR_FIELDS, SUBJECT_LABEL, type Evidence, type NodeKind, type StarField, type Subject } from "./nodes";
import type { NodeData, NodeRow } from "./node-tree";

export type DocField = { field: StarField; label: string; text: string; subject: Subject; subjectLabel: string; evidence: Evidence[] };
export type DocOutput = { name: string; url: string | null; isFinal: boolean; hasFile: boolean };
export type DocNode = {
  id: string;
  kind: NodeKind | "all";
  kindLabel: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  fields: DocField[];
  outputs: DocOutput[];
  children: DocNode[];
};
export type StarDocument = { root: DocNode; /** 문서에 든 활동·세부활동 수 */ activityCount: number };

const byOrder = (a: NodeRow, b: NodeRow) => a.sortOrder - b.sortOrder || (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || a.name.localeCompare(b.name, "ko");

/**
 * rootId의 노드와 그 아래를 문서로 만든다. rootId가 null이면 맨 위 노드 전체("전체 기록").
 * 문서에 넣을 수 없는 노드(없음·휴지통·제외)를 가리키면 null이다.
 */
export function buildStarDocument(data: NodeData, rootId: string | null): StarDocument | null {
  const allowed = new Set(documentNodeIds(data.nodes.map((n) => ({ id: n.id, parentId: n.parentId, kind: n.kind, portfolioStatus: n.portfolioStatus, deletedAt: n.deletedAt }))));
  const nodes = data.nodes.filter((n) => allowed.has(n.id));
  const childrenOf = new Map<string | null, NodeRow[]>();
  for (const n of nodes) childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n]);
  for (const list of childrenOf.values()) list.sort(byOrder);

  let count = 0;
  const make = (n: NodeRow): DocNode | null => {
    const children = (childrenOf.get(n.id) ?? []).map(make).filter((c): c is DocNode => c !== null);
    const star = hasStar(n.kind);
    const fields: DocField[] = star
      ? STAR_FIELDS.flatMap((f) => {
          const row = data.fields.find((x) => x.nodeId === n.id && x.field === f);
          if (!row || row.text.trim() === "") return [];
          const evidence = data.evidence.filter((e) => e.nodeId === n.id && e.field === f).map((e) => ({ conversationTitle: e.conversationTitle, conversationDate: e.conversationDate, excerpt: e.excerpt }));
          return [{ field: f, label: STAR_FIELD_LABEL[f], text: row.text, subject: row.subject, subjectLabel: SUBJECT_LABEL[row.subject], evidence }];
        })
      : [];
    const outputs: DocOutput[] = data.outputs.filter((o) => o.nodeId === n.id).map((o) => ({ name: o.name, url: o.url, isFinal: o.isFinal, hasFile: o.storagePath !== null }));
    // STAR를 가질 수 없는 가지(범주·프로젝트)는 아래에 문서에 쓸 노드가 하나도 없으면 문서에서 뺀다
    const hasContent = star || n.kind === "study" || fields.length > 0 || outputs.length > 0 || n.description.trim() !== "";
    if (!hasContent && children.length === 0) return null;
    if (star) count += 1;
    return { id: n.id, kind: n.kind, kindLabel: NODE_KIND_LABEL[n.kind], name: n.name, description: n.description, startDate: n.startDate, endDate: n.endDate, fields, outputs, children };
  };

  if (rootId === null) {
    const tops = (childrenOf.get(null) ?? []).map(make).filter((c): c is DocNode => c !== null);
    return { root: { id: "all", kind: "all", kindLabel: "전체", name: "Trail 전체 기록", description: "", startDate: null, endDate: null, fields: [], outputs: [], children: tops }, activityCount: count };
  }
  const root = nodes.find((n) => n.id === rootId);
  if (!root) return null;
  // 루트는 내용이 없어도 문서의 머리가 된다(아래에 쓸 것이 없으면 머리만 있는 문서)
  const doc: DocNode = make(root) ?? { id: root.id, kind: root.kind, kindLabel: NODE_KIND_LABEL[root.kind], name: root.name, description: root.description, startDate: root.startDate, endDate: root.endDate, fields: [], outputs: [], children: [] };
  return { root: doc, activityCount: count };
}

// ───────── Markdown ─────────

const mdText = (text: string): string => text.replace(/^(#{1,6}\s)/gm, "\\$1"); // 본문 줄이 제목으로 바뀌지 않게
const mdInline = (text: string): string => text.replace(/[[\]]/g, "\\$&");
const period = (n: { startDate: string | null; endDate: string | null }): string => (n.startDate || n.endDate ? `${n.startDate ?? "?"} ~ ${n.endDate ?? "?"}` : "");

function nodeMarkdown(n: DocNode, level: number, out: string[]): void {
  const heading = "#".repeat(Math.min(level, 6));
  const p = period(n);
  out.push(`${heading} ${mdInline(n.name)}${p ? ` (${p})` : ""}`, "");
  if (level > 1 || n.kind !== "all") out.push(`_${n.kindLabel}_`, "");
  if (n.description.trim()) out.push(mdText(n.description.trim()), "");
  for (const f of n.fields) {
    out.push(`**${f.label}** _(${f.subjectLabel})_`, "", mdText(f.text.trim()), "");
    for (const e of f.evidence) out.push(`> “${e.excerpt.replace(/\n+/g, " ")}” — ${mdInline(e.conversationTitle)}, ${e.conversationDate}`, "");
  }
  if (n.outputs.length > 0) {
    out.push("**산출물**", "");
    for (const o of n.outputs) out.push(`- ${o.isFinal ? "[최종] " : ""}${o.url ? `[${mdInline(o.name)}](${o.url})` : mdInline(o.name)}${o.hasFile ? " (첨부 파일 있음 — 앱에서 내려받기)" : ""}`);
    out.push("");
  }
  for (const c of n.children) nodeMarkdown(c, level + 1, out);
}

export function toMarkdown(doc: StarDocument, now: Date): string {
  const out: string[] = [];
  nodeMarkdown(doc.root, 1, out);
  out.push("---", "", `Trail에서 ${now.toISOString().slice(0, 10)}에 내려받음 · 활동 ${doc.activityCount}개 · 비어 있는 항목은 쓰지 않았고, 제외·휴지통 노드는 뺐습니다.`, "");
  return out.join("\n");
}

// ───────── JSON ─────────

export function toJson(doc: StarDocument, now: Date): string {
  const strip = (n: DocNode): unknown => ({
    id: n.id,
    kind: n.kind,
    name: n.name,
    description: n.description,
    startDate: n.startDate,
    endDate: n.endDate,
    fields: Object.fromEntries(n.fields.map((f) => [f.field, { text: f.text, subject: f.subject, evidence: f.evidence }])),
    outputs: n.outputs,
    children: n.children.map(strip),
  });
  return JSON.stringify({ format: "trail-star-document", version: 1, exportedAt: now.toISOString(), activityCount: doc.activityCount, root: strip(doc.root) }, null, 2);
}

// ───────── 파일 이름 ─────────

/** 내려받는 파일 이름: ASCII 대체 이름과, 한글 이름을 그대로 쓰는 UTF-8 이름(RFC 5987)을 함께 돌려준다 */
export function exportFileNames(doc: StarDocument, ext: "md" | "json", now: Date): { ascii: string; utf8: string } {
  const day = now.toISOString().slice(0, 10);
  const ascii = `trail-star-${day}.${ext}`;
  const clean = doc.root.name.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").replace(/^[.\s]+/, "").trim().slice(0, 60);
  return { ascii, utf8: `${clean === "" ? "trail" : clean}-${day}.${ext}` };
}
