// 브라우저에서 쓰는 Supabase 연결. 실시간 갱신(PLAN 16번)에서 쓰게 된다.
import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
