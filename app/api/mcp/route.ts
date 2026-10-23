// Design Ref: DESIGN.md §14.4 — Claude 커스텀 커넥터가 호출하는 원격 MCP 접수 창구. 도구는 list_cards(이어붙일 활동·위치 조회), record_cards(활동 기록·병합), get_record_rules 세 개다.
// 흐름: 크기 제한 → 토큰 확인(서명 + 내 계정) → 호출 횟수 → 도구 실행. 로그에는 종류·코드만 남기고 카드 내용은 남기지 않는다.
import { createClient } from "@supabase/supabase-js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { limitRequestBody } from "@/lib/mcp/body-limit";
import { listActivities } from "@/lib/mcp/list-activities";
import { loadRecordRules } from "@/lib/mcp/record-rules";
import { verifyOwnerToken } from "@/lib/mcp/owner-auth";
import { guardRequest } from "@/lib/mcp/rate-guard";
import { recordActivities } from "@/lib/mcp/record-activities";
import { createSupabaseRateStore } from "@/lib/mcp/supabase-rate-store";
import { createSupabaseNodeStore } from "@/lib/mcp/supabase-node-store";
import { StoreError } from "@/lib/mcp/errors";
import { supabaseEnv } from "@/lib/supabase/env";

/** 로그인한 사람의 토큰을 그대로 실어 보내는 연결: 데이터 접근에 "내 행만" 규칙(RLS)이 걸린다. */
function clientFor(token: string) {
  const { url, key } = supabaseEnv();
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const text = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

function describeFailure(error: unknown): string {
  console.error("[mcp] 도구 처리 실패", error instanceof StoreError ? { message: error.message } : { kind: "unknown" });
  return "처리하지 못했습니다. 잠시 뒤 한 번만 다시 시도해 주세요.";
}

const evidenceShape = z.object({
  conversationTitle: z.string().describe("근거가 된 대화의 제목."),
  conversationDate: z.string().describe("그 대화 날짜(YYYY-MM-DD)."),
  excerpt: z.string().describe("원문 발췌, 300자 이하. 사용자가 실제로 한 말이나 대화에 실제로 있던 내용만 옮긴다."),
});
const fieldShape = z.object({
  text: z.string().describe("항목 내용. 근거(evidence)로 직접 확인되는 내용만 쓴다."),
  subject: z.enum(["did", "plan", "claude_unconfirmed", "estimate"]).describe("주체: did=내가 한 일, plan=내 계획, claude_unconfirmed=Claude가 제안했고 사용자가 채택했는지 확인 안 됨, estimate=추정."),
  evidence: z.array(evidenceShape).max(3).optional().describe("이 항목의 근거(최대 3개). 근거가 없으면 이 항목은 보내지 않는다(앱이 비워 둔다)."),
});
const activityShape = z.looseObject({
  nodeId: z.string().optional().describe("기존 활동에 이어붙일 때 list_cards의 activities[].id. 새 활동이면 비운다."),
  name: z.string().optional().describe("새 활동일 때 활동 이름(60자 이하)."),
  kind: z.enum(["activity", "subactivity", "study"]).optional().describe("새 노드의 종류. 기본 activity. subactivity는 parentId가 활동이어야 한다."),
  description: z.string().optional().describe("새 활동의 한두 줄 설명(500자 이하)."),
  startDate: z.string().optional().describe("시작일 YYYY-MM-DD."),
  endDate: z.string().optional().describe("종료일 YYYY-MM-DD."),
  parentId: z.string().optional().describe("새 활동을 둘 위치: list_cards의 places[].id."),
  projectName: z.string().optional().describe("새 활동을 둘 프로젝트 이름. parentId가 없을 때만 쓴다. 같은 이름의 프로젝트가 있으면 그 아래에, 없으면 새로 만든다."),
  fields: z
    .object({ situation: fieldShape.optional(), task: fieldShape.optional(), action: fieldShape.optional(), result_conversation: fieldShape.optional() })
    .optional()
    .describe("STAR 항목. situation=상황(300자), task=과제(200자), action=내가 한 일(500자), result_conversation=결과 중 대화에서 얻은 것(300자). 외부 결과는 보내지 않는다(사용자가 직접 입력)."),
  outputs: z.array(z.object({ name: z.string(), url: z.string().optional() })).max(5).optional().describe("산출물(이름, 선택적으로 http(s) 링크)."),
});

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_cards",
      {
        title: "이어붙일 활동·위치 조회",
        description: "기록하기 전에 먼저 부른다. 기존 활동 목록(activities: id·경로·기간·채워진 항목·잠긴 항목), 새 활동을 둘 수 있는 위치(places), 이 대화에서 질문한 횟수(questionCount)와 이미 질문한 주제(askedTopics)를 돌려준다. 내용(요약·근거)은 돌려주지 않는다.",
        inputSchema: z.object({ conversationKey: z.string().optional().describe("대화 키. 처음 기록하는 대화면 비운다.") }),
      },
      async (input, ctx) => {
        const token = ctx.http?.authInfo?.token;
        if (!token) return text("인증 정보가 없습니다.", true);
        try {
          const client = clientFor(token);
          const guard = await guardRequest(createSupabaseRateStore(client), 0);
          if (!guard.ok) return text(guard.message, true);
          const outcome = await listActivities(createSupabaseNodeStore(client), input);
          return outcome.ok ? text(outcome.output) : text(outcome.errors.join(" / "), true);
        } catch (error) {
          return text(describeFailure(error), true);
        }
      },
    );

    server.registerTool(
      "get_record_rules",
      {
        title: "최신 기록 규칙 조회",
        description: "Trail의 최신 기록 규칙(언제 기록하고 묻는지, 카드 한도, 실패 시 행동)을 돌려준다. 규칙이 헷갈리거나 사용자 지침과 다르게 느껴질 때 부른다.",
        inputSchema: z.object({}),
      },
      async (_input, ctx) => {
        const token = ctx.http?.authInfo?.token;
        if (!token) return text("인증 정보가 없습니다.", true);
        try {
          const guard = await guardRequest(createSupabaseRateStore(clientFor(token)), 0);
          if (!guard.ok) return text(guard.message, true);
          const rules = await loadRecordRules();
          return rules ? text(rules) : text("규칙 문서를 읽지 못했습니다.", true);
        } catch (error) {
          return text(describeFailure(error), true);
        }
      },
    );

    server.registerTool(
      "record_cards",
      {
        title: "활동 기록·병합",
        description:
          "사용자가 기록하기로 한 내용을 활동 카드(STAR)로 기록한다. 기존 활동에 이어붙이려면 nodeId를, 새 활동이면 name(과 위치)을 보낸다. 사용자가 고친(잠긴) 항목은 앱이 건드리지 않고 제안으로 따로 쌓는다. 근거가 없는 항목은 보내지 않는다. 처음 기록하면 대화 키가 발급되니 같은 대화에서는 그 키를 계속 쓴다. 비밀번호·키 같은 비밀값은 보내지 않는다.",
        inputSchema: z.object({
          conversationKey: z.string().optional().describe("대화 키. 처음이면 비운다."),
          questionCount: z.number().optional().describe("이번 대화에서 기록 여부를 물은 횟수(0~3)."),
          topicKey: z.string().optional().describe("방금 기록 여부를 물은 주제 이름. 주제당 1회만 묻는다."),
          activities: z.array(activityShape).describe("기록할 활동들(한 번에 최대 5개)."),
        }),
      },
      async (input, ctx) => {
        const token = ctx.http?.authInfo?.token;
        if (!token) return text("인증 정보가 없습니다.", true);
        try {
          const client = clientFor(token);
          const guard = await guardRequest(createSupabaseRateStore(client), 0);
          if (!guard.ok) return text(guard.message, true);
          const outcome = await recordActivities(createSupabaseNodeStore(client), input);
          return outcome.ok ? text(outcome.output) : text(outcome.errors.join(" / "), true);
        } catch (error) {
          return text(describeFailure(error), true);
        }
      },
    );
  },
  { serverInfo: { name: "trail", version: "0.1.0" } },
);

/** 서명을 확인한 토큰의 사용자 번호가 내 계정(OWNER_USER_ID)과 같아야 통과한다. */
const authed = withMcpAuth(
  handler,
  async (_req, bearer) =>
    verifyOwnerToken(bearer, process.env.OWNER_USER_ID, async (token) => {
      const { data, error } = await clientFor(token).auth.getClaims(token);
      if (error || !data?.claims?.sub) return null;
      const claims = data.claims as { sub: string; client_id?: string; scope?: string };
      return { sub: claims.sub, clientId: claims.client_id, scope: claims.scope };
    }),
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource" },
);

async function guarded(request: Request): Promise<Response> {
  const limited = await limitRequestBody(request);
  if (!limited.ok) return Response.json({ error: "요청이 너무 큽니다(20KB 초과)." }, { status: 413 });
  return authed(limited.request);
}

export { guarded as GET, guarded as POST };
