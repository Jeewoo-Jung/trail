// Design Ref: PRD 5 must 2 — 새 개념(상위 개념 포함)은 내가 승인한 뒤에야 확정된다. 승인·거절은 가지째(그 아래 제안까지) 한 번에 한다.
// 거절하면 그 가지의 개념은 거절 상태로 남아 같은 이름이 다시 제안되지 않고, 거기 붙어 있던 카드는 부모 개념으로 올라간다(뿌리면 미분류).
// 데이터베이스 함수(approve_concept·reject_concept)가 한 번에 처리해서 중간에 멈춰도 반쪽만 적용되지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError } from "../mcp/store";

/** 제안 중인 개념을 가지째 승인한다. 이미 처리됐거나 없는 것, 부모가 아직 승인되지 않은 것이면 false. */
export async function approveConcept(client: SupabaseClient, conceptId: string): Promise<boolean> {
  const { data, error } = await client.rpc("approve_concept", { p_id: conceptId });
  if (error) {
    if (/parent_not_approved/.test(error.message)) return false;
    throw new StoreError("개념 승인", error.code);
  }
  return Number(data) > 0;
}

export async function rejectConcept(client: SupabaseClient, conceptId: string): Promise<boolean> {
  const { data, error } = await client.rpc("reject_concept", { p_id: conceptId });
  if (error) throw new StoreError("개념 거절", error.code);
  return Number(data) > 0;
}
