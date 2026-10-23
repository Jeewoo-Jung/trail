// /my 화면에 쓸 카드·개념을 읽어 트리로 만든다. 로그인한 사람의 연결로 읽으므로 "내 행만" 규칙이 걸린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassificationCandidate } from "../rules/card";
import { buildTree, type CardRow, type SubRow, type TopNode, type TopRow } from "../rules/tree";
import { StoreError } from "../mcp/store";

export type TreeData = { tree: TopNode[]; totalCards: number };

export async function loadTree(client: SupabaseClient): Promise<TreeData> {
  const [cards, tops, subs] = await Promise.all([
    client
      .from("cards")
      .select("id, title, summary, keywords, evidence, candidates, top_concept_id, sub_concept_id, classification_status, created_at")
      .order("created_at", { ascending: false }),
    client.from("top_concepts").select("id, name, sort_order"),
    client.from("sub_concepts").select("id, top_concept_id, name, status"),
  ]);
  if (cards.error) throw new StoreError("카드 읽기", cards.error.code);
  if (tops.error) throw new StoreError("상위 개념 읽기", tops.error.code);
  if (subs.error) throw new StoreError("하위 개념 읽기", subs.error.code);

  const cardRows: CardRow[] = (cards.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary ?? "",
    keywords: r.keywords ?? [],
    evidence: Array.isArray(r.evidence) ? r.evidence : [],
    candidates: Array.isArray(r.candidates) ? (r.candidates as ClassificationCandidate[]) : [],
    topId: r.top_concept_id,
    subId: r.sub_concept_id,
    status: r.classification_status,
    createdAt: r.created_at,
  }));
  const topRows: TopRow[] = (tops.data ?? []).map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
  const subRows: SubRow[] = (subs.data ?? []).map((r) => ({ id: r.id, topId: r.top_concept_id, name: r.name, status: r.status }));
  return { tree: buildTree(cardRows, topRows, subRows), totalCards: cardRows.length };
}
