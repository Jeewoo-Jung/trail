// Design Ref: PRD 5 must 2 — 새 하위 개념은 내가 승인해야 확정된다. 거절하면 같은 상위 개념 아래에서 같은 이름으로 다시 제안되지 않고,
// 그 카드는 "하위 미정"으로 둔다. (거절한 이름은 표에 rejected로 남겨 두어서 다시 제안을 막는다.)
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError } from "../mcp/store";

/** 제안(proposed) 상태인 하위 개념만 바꾼다. 이미 처리됐거나 없는 것이면 false. */
export async function approveSubConcept(client: SupabaseClient, subId: string): Promise<boolean> {
  const { data, error } = await client.from("sub_concepts").update({ status: "approved" }).eq("id", subId).eq("status", "proposed").select("id");
  if (error) throw new StoreError("하위 개념 승인", error.code);
  return (data?.length ?? 0) > 0;
}

export async function rejectSubConcept(client: SupabaseClient, subId: string): Promise<boolean> {
  const { data, error } = await client.from("sub_concepts").update({ status: "rejected" }).eq("id", subId).eq("status", "proposed").select("id");
  if (error) throw new StoreError("하위 개념 거절", error.code);
  if ((data?.length ?? 0) === 0) return false;
  // 그 하위 개념에 붙어 있던 카드는 상위 개념 아래 "하위 미정"으로 둔다.
  const cards = await client.from("cards").update({ sub_concept_id: null }).eq("sub_concept_id", subId);
  if (cards.error) throw new StoreError("카드의 하위 개념 비우기", cards.error.code);
  return true;
}
