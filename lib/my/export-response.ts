// Design Ref: DESIGN.md §14.5 — 내려받기 응답을 만드는 순수 함수(로그인 확인과 데이터 읽기는 라우트가 한다). 시험할 수 있게 따로 둔다.
import { z } from "zod";
import type { NodeData } from "../rules/node-tree";
import { buildStarDocument, exportFileNames, toJson, toMarkdown } from "../rules/star-doc";

const scopeSchema = z.union([z.literal("all"), z.uuid()]);
const formatSchema = z.enum(["md", "json"]);

export function buildExportResponse(data: NodeData, scopeParam: string | null, formatParam: string | null, now: Date): Response {
  const format = formatSchema.safeParse(formatParam);
  if (!format.success) return new Response("format은 md 또는 json이어야 합니다.", { status: 400 });
  const scope = scopeSchema.safeParse(scopeParam ?? "all");
  if (!scope.success) return new Response("scope는 all 또는 노드 id여야 합니다.", { status: 400 });

  const doc = buildStarDocument(data, scope.data === "all" ? null : scope.data);
  if (!doc) return new Response("내려받을 수 없는 노드입니다(없거나 휴지통·제외 상태).", { status: 404 });

  const body = format.data === "json" ? toJson(doc, now) : toMarkdown(doc, now);
  const names = exportFileNames(doc, format.data, now);
  return new Response(body, {
    headers: {
      "content-type": format.data === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${names.ascii}"; filename*=UTF-8''${encodeURIComponent(names.utf8)}`,
      "cache-control": "private, no-store",
    },
  });
}
