// Design Ref: DESIGN.md §4.1, §6.1 — Claude 커스텀 커넥터가 호출하는 원격 MCP 접수 창구. 도구는 list_cards, record_cards, get_record_rules 세 개다.
// 흐름: 크기 제한 → 토큰 확인(서명 + 내 계정) → 호출 횟수 → 도구 실행. 로그에는 종류·코드만 남기고 카드 내용은 남기지 않는다.
import { createClient } from "@supabase/supabase-js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { after } from "next/server";
import { z } from "zod";
import { createClaudeClassifier } from "@/lib/claude/classifier";
import { limitRequestBody } from "@/lib/mcp/body-limit";
import { classifyPendingThenWaiting, type Classifier } from "@/lib/mcp/classify-card";
import { listCards } from "@/lib/mcp/list-cards";
import { loadRecordRules } from "@/lib/mcp/record-rules";
import { verifyOwnerToken } from "@/lib/mcp/owner-auth";
import { guardRequest } from "@/lib/mcp/rate-guard";
import { recordCards } from "@/lib/mcp/record-cards";
import { createSupabaseClassifyStore } from "@/lib/mcp/supabase-classify-store";
import { createSupabaseRateStore } from "@/lib/mcp/supabase-rate-store";
import { createSupabaseCardStore } from "@/lib/mcp/supabase-store";
import { StoreError } from "@/lib/mcp/store";
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

const cardShape = z.looseObject({
  topicKey: z.unknown().describe("문자열. 이 주제를 가리키는 짧은 이름. 같은 대화에서 같은 주제를 다시 보내면 같은 카드를 갱신한다."),
  title: z.unknown().describe("문자열. 카드 제목."),
  summary: z.unknown().optional().describe("문자열, 500자 이하. 근거로 확인되지 않는 문장 끝에는 (추정)을 붙인다. 근거가 없으면 비워 둔다."),
  keywords: z.unknown().optional().describe("문자열 배열, 최대 7개."),
  evidence: z.unknown().optional().describe("문자열 배열, 최대 3개, 각 300자 이하. 요약의 근거가 되는 발췌."),
  candidates: z.unknown().optional().describe("최대 3개의 {top, sub, isNewSub} 분류 후보."),
  cardId: z.unknown().optional().describe("문자열. list_cards로 얻은 카드 id. 그 카드를 갱신할 때만 쓴다."),
  projectTopic: z.unknown().optional().describe("문자열. 프로젝트 주제."),
});

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_cards",
      {
        title: "이 대화의 카드 조회",
        description: "기록하기 전에 먼저 부른다. 이 대화에 이미 있는 카드(id·주제 키·제목), 상위·승인된 하위 개념 목록, 제외 주제 목록을 돌려준다.",
        inputSchema: z.object({ conversationKey: z.string().optional().describe("대화 키. 처음 기록하는 대화면 비운다.") }),
      },
      async (input, ctx) => {
        const token = ctx.http?.authInfo?.token;
        if (!token) return text("인증 정보가 없습니다.", true);
        try {
          const client = clientFor(token);
          const guard = await guardRequest(createSupabaseRateStore(client), 0);
          if (!guard.ok) return text(guard.message, true);
          const outcome = await listCards(createSupabaseCardStore(client), input);
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
        title: "카드 기록·갱신",
        description:
          "결정이나 결론이 나온 내용을 카드로 기록하거나 갱신한다. 한 번에 여러 장을 보낼 수 있다. 처음 기록하면 대화 키가 발급되니 같은 대화에서는 그 키를 계속 쓴다. 비밀번호·키 같은 비밀값은 보내지 않는다.",
        inputSchema: z.object({
          conversationKey: z.string().optional().describe("대화 키. 처음이면 비운다."),
          questionCount: z.number().optional().describe("이번 대화에서 기록 여부를 확인하려고 질문한 횟수(0 이상 정수)."),
          excludeTopics: z.array(z.string()).optional().describe("사용자가 '이 주제는 항상 제외'를 고른 주제 이름들."),
          cards: z.array(cardShape).describe("기록할 카드들."),
        }),
      },
      async (input, ctx) => {
        const token = ctx.http?.authInfo?.token;
        if (!token) return text("인증 정보가 없습니다.", true);
        try {
          const client = clientFor(token);
          const guard = await guardRequest(createSupabaseRateStore(client), 0);
          if (!guard.ok) return text(guard.message, true);
          const outcome = await recordCards(createSupabaseCardStore(client), input);
          if (!outcome.ok) return text(outcome.errors.join(" / "), true);

          // 응답은 먼저 돌려주고, 분류(Claude API)는 그 뒤에 이어서 한다. 실패하면 카드는 "미분류(대기)"로 남는다.
          after(async () => {
            try {
              const apiKey = process.env.ANTHROPIC_API_KEY;
              const classifier: Classifier = apiKey
                ? createClaudeClassifier(apiKey)
                : async () => {
                    throw new Error("ANTHROPIC_API_KEY 없음");
                  };
              await classifyPendingThenWaiting(createSupabaseClassifyStore(client), classifier);
            } catch (error) {
              console.error("[mcp] 분류 후처리 실패", error instanceof StoreError ? { message: error.message } : { kind: "unknown" });
            }
          });
          return text(outcome.output);
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
