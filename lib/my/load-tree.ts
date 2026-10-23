// /my 화면에 쓸 카드·개념을 읽어 트리로 만든다. 로그인한 사람의 연결로 읽으므로 "내 행만" 규칙이 걸린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ClassificationCandidate, normalizeStoredCandidate } from "../rules/card";
import { buildTree, type CardRow, type ConceptNode, type ConceptRow } from "../rules/tree";
import { StoreError } from "../mcp/store";

export type TreeData = { tree: ConceptNode[]; totalCards: number };

export async function loadTree(client: SupabaseClient): Promise<TreeData> {
  const [cards, concepts] = await Promise.all([
    client
      .from("cards")
      .select("id, title, summary, keywords, evidence, candidates, concept_id, classification_status, created_at")
      .order("created_at", { ascending: false }),
    client.from("concepts").select("id, parent_id, name, status, sort_order"),
  ]);
  if (cards.error) throw new StoreError("카드 읽기", cards.error.code);
  if (concepts.error) throw new StoreError("개념 읽기", concepts.error.code);

  const cardRows: CardRow[] = (cards.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary ?? "",
    keywords: r.keywords ?? [],
    evidence: Array.isArray(r.evidence) ? r.evidence : [],
    candidates: Array.isArray(r.candidates) ? (r.candidates as unknown[]).map(normalizeStoredCandidate).filter((c): c is ClassificationCandidate => c !== null) : [],
    conceptId: r.concept_id,
    status: r.classification_status,
    createdAt: r.created_at,
  }));
  const conceptRows: ConceptRow[] = (concepts.data ?? []).map((r) => ({ id: r.id, parentId: r.parent_id, name: r.name, status: r.status, sortOrder: r.sort_order }));
  return { tree: buildTree(cardRows, conceptRows), totalCards: cardRows.length };
}
