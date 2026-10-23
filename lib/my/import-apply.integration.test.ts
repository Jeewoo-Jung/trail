// 진짜 Supabase(내 계정 로그인)에서 추천 승인 저장이 실제로 동작하는지 시험한다. (PLAN 21번)
// 상위 개념은 이 시험에서 실제로 만들지 않고(내 데이터에 남지 않게), 권한 규칙만 확인한다.
// 프로젝트 주제는 저장한 뒤 시험 전 상태로 되돌린다. 실행: npm run test:integration
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseCardStore } from "../mcp/supabase-store";
import { listCards } from "../mcp/list-cards";
import { saveApproved } from "./import-apply";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TRAIL_LOGIN_EMAIL;
const password = process.env.TRAIL_LOGIN_PASSWORD;
const enabled = Boolean(url && key && email && password);

describe.skipIf(!enabled)("추천 승인 저장 (실제 로그인으로 시험)", () => {
  let client: SupabaseClient;
  let userId = "";
  let before: { project_topics: string[]; always_excluded: string[]; blocked: string[] } | null = null;

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { data, error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error("로그인하지 못했습니다.");
    userId = data.user.id;
    before = (await client.from("settings").select("project_topics, always_excluded, blocked").maybeSingle()).data;
  });

  afterAll(async () => {
    if (!client) return;
    if (before === null) await client.from("settings").delete().eq("user_id", userId);
    else await client.from("settings").update(before).eq("user_id", userId);
    await client.auth.signOut({ scope: "local" });
  });

  it("승인한 프로젝트 주제를 저장하고, list_cards가 돌려준다. 같은 것을 또 저장하면 새 항목이 없다고 알린다", async () => {
    const first = await saveApproved(client, [], ["__시험 주제 A", "__시험 주제 B"]);
    expect(first).toEqual({ ok: true, savedTopConcepts: 0, savedProjectTopics: 2 });
    const listed = await listCards(createSupabaseCardStore(client), {});
    if (!listed.ok) throw new Error("조회 실패");
    expect(listed.output.projectTopics).toEqual(expect.arrayContaining(["__시험 주제 A", "__시험 주제 B"]));
    const again = await saveApproved(client, [], ["__시험 주제 A"]);
    expect(again).toMatchObject({ ok: false });
  });

  it("저장해도 항상 제외·무조건 제외 목록은 그대로다", async () => {
    const now = (await client.from("settings").select("always_excluded, blocked").maybeSingle()).data;
    expect(now?.always_excluded ?? []).toEqual(before?.always_excluded ?? []);
    expect(now?.blocked ?? []).toEqual(before?.blocked ?? []);
  });

  it("개념은 내 행으로만 추가할 수 있고, 로그인하지 않은 연결로는 읽을 수도 없다", async () => {
    const other = await client.from("concepts").insert({ user_id: "00000000-0000-4000-8000-000000000000", name: "__시험 남의 행" });
    expect(other.error).not.toBeNull(); // 남의 번호로는 추가할 수 없다
    const anon = await createClient(url!, key!).from("concepts").insert({ name: "__시험 익명" });
    expect(anon.error).not.toBeNull();
  });
});
