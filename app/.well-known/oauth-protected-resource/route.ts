// Design Ref: DESIGN.md §4.3 — Claude에게 "로그인(인증) 서버는 Supabase"라고 알려 주는 안내문(RFC 9728).
import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { supabaseEnv } from "@/lib/supabase/env";

export function GET(request: Request): Response {
  return protectedResourceHandler({ authServerUrls: [`${supabaseEnv().url}/auth/v1`] })(request);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
