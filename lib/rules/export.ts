// Design Ref: PRD 5 must 2 — 화면과 같은 카드 데이터(근거 발췌 포함)를 Markdown과 JSON으로 내려받는다.
import type { ConceptNode, TreeCard } from "./tree";
import { cardsOfNode } from "./tree";

export type ExportedCard = {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  evidence: string[];
  candidates: TreeCard["candidates"];
  /** 뿌리부터 이 카드가 붙은 개념까지의 이름들. 비어 있으면 미분류 */
  path: string[];
  /** path의 첫째·둘째(옛 내려받기와 맞추려고 남겨 둔다) */
  top: string | null;
  sub: string | null;
  classificationStatus: TreeCard["status"];
  hasEstimate: boolean;
  noEvidence: boolean;
  createdAt: string;
};

export function exportCards(tree: readonly ConceptNode[]): ExportedCard[] {
  return cardsOfNode(tree, null).map((c) => ({
    id: c.id,
    title: c.title,
    summary: c.summary,
    keywords: c.keywords,
    evidence: c.evidence,
    candidates: c.candidates,
    path: c.path,
    top: c.path[0] ?? null,
    sub: c.path[1] ?? null,
    classificationStatus: c.status,
    hasEstimate: c.hasEstimate,
    noEvidence: c.noEvidence,
    createdAt: c.createdAt,
  }));
}

export function toJson(tree: readonly ConceptNode[], exportedAt: Date): string {
  return JSON.stringify({ exportedAt: exportedAt.toISOString(), cards: exportCards(tree) }, null, 2);
}

/** 한 줄로 이어 쓰는 자리(제목·주제)에서 줄바꿈이 Markdown 구조를 깨지 않게 한다. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export function toMarkdown(tree: readonly ConceptNode[], exportedAt: Date): string {
  const lines: string[] = ["# Trail 내보내기", "", `내보낸 시각: ${exportedAt.toISOString()}`, ""];
  const cards = exportCards(tree);
  if (cards.length === 0) lines.push("기록된 카드가 없습니다.", "");

  const groups = new Map<string, ExportedCard[]>();
  for (const card of cards) {
    const key = card.path.length > 0 ? card.path.join(" > ") : "미분류";
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  for (const [group, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"))) {
    lines.push(`## ${oneLine(group)}`, "");
    for (const c of items) {
      lines.push(`### ${oneLine(c.title)}`, "", `- 기록일: ${c.createdAt.slice(0, 10)}`);
      if (c.classificationStatus === "pending") lines.push("- 상태: 분류 중");
      if (c.classificationStatus === "waiting") lines.push("- 상태: 미분류(대기)");
      if (c.keywords.length > 0) lines.push(`- 개념어: ${c.keywords.map((k) => `#${oneLine(k)}`).join(" ")}`);
      lines.push("");
      if (c.summary !== "") lines.push(c.summary, "");
      if (c.hasEstimate) lines.push("> 이 요약에는 추정이 포함돼 있습니다.", "");
      if (c.noEvidence) lines.push("> 근거 없음", "");
      for (const e of c.evidence) lines.push(`> “${e.replace(/\n+/g, " ")}”`, ">");
      if (c.evidence.length > 0) lines.pop(); // 마지막 빈 인용줄 제거
      if (c.evidence.length > 0) lines.push("");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
