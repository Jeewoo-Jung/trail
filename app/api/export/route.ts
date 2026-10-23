// Design Ref: DESIGN.md §14.5 — STAR 문서를 Markdown·JSON으로 내려받는다. 로그인한 나만 받을 수 있고, 로그인하지 않으면 데이터를 읽지 않는다.
// ?scope=all(전체) 또는 노드 id(프로젝트·활동 단위) & ?format=md|json. 제외·휴지통 노드는 문서에서 자동으로 빠진다.
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildExportResponse } from "@/lib/my/export-response";
import { loadNodeData } from "@/lib/my/load-nodes";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("로그인이 필요합니다.", { status: 401 });
  const params = new URL(request.url).searchParams;
  return buildExportResponse(await loadNodeData(await createClient()), params.get("scope"), params.get("format"), new Date());
}
