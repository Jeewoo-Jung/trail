// Design Ref: DESIGN.md §6.2 — Markdown·JSON 내려받기. 로그인한 나만 받을 수 있고, 로그인하지 않으면 데이터를 읽지 않는다.
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadTree } from "@/lib/my/load-tree";
import { toJson, toMarkdown } from "@/lib/rules/export";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("로그인이 필요합니다.", { status: 401 });

  const format = new URL(request.url).searchParams.get("format");
  if (format !== "md" && format !== "json") return new Response("format은 md 또는 json이어야 합니다.", { status: 400 });

  const { tree } = await loadTree(await createClient());
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const body = format === "json" ? toJson(tree, now) : toMarkdown(tree, now);
  return new Response(body, {
    headers: {
      "content-type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="trail-${day}.${format === "json" ? "json" : "md"}"`,
      "cache-control": "private, no-store",
    },
  });
}
