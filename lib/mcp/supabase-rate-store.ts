// RateStore를 Supabase api_calls 표로 구현한다. 로그인한 사람의 연결로 쓰므로 "내 행만" 규칙이 걸린다.
// 읽고 쓰는 사이에 동시 호출이 겹치면 한두 번 덜 셀 수 있으나, 혼자 쓰는 앱이라 받아들인다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateStore } from "./rate-guard";
import { StoreError } from "./store";

export function createSupabaseRateStore(client: SupabaseClient): RateStore {
  return {
    async increment(kind, windowStart) {
      const start = windowStart.toISOString();
      const read = await client.from("api_calls").select("count").eq("kind", kind).eq("window_start", start).maybeSingle();
      if (read.error) throw new StoreError("호출 횟수 읽기", read.error.code);
      const next = (read.data?.count ?? 0) + 1;
      const write = await client
        .from("api_calls")
        .upsert({ kind, window_start: start, count: next }, { onConflict: "user_id,kind,window_start" });
      if (write.error) throw new StoreError("호출 횟수 저장", write.error.code);
      return next;
    },
  };
}
