// Design Ref: PLAN 19 — 무조건 제외할 주제를 적는 입력칸. 처음에는 비어 있다. 여기 적은 주제는 기록하지 않는다.
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BLOCKED_MAX_COUNT, BLOCKED_NAME_MAX_CHARS } from "@/lib/rules/settings";
import { createClient } from "@/lib/supabase/server";
import { saveBlocked } from "./actions";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl">설정</h1>
      <Suspense fallback={<p className="text-sm text-subtle">불러오는 중…</p>}>
        <SettingsForm searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SettingsForm({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("blocked, always_excluded").maybeSingle();
  const blocked: string[] = data?.blocked ?? [];
  const alwaysExcluded: string[] = data?.always_excluded ?? [];

  return (
    <section className="flex flex-col gap-6">
      {params.saved === "1" && <p role="status" className="text-sm text-ok">저장했습니다.</p>}
      {typeof params.error === "string" && <p role="alert" className="text-sm text-danger">{params.error}</p>}

      <form action={saveBlocked} className="flex flex-col gap-3">
        <label htmlFor="blocked" className="text-sm font-medium">무조건 제외할 주제</label>
        <p className="text-xs text-subtle">
          한 줄에 하나씩(또는 쉼표로 구분해) 적습니다. 여기에 적은 주제는 Claude가 기록하려 해도 저장하지 않습니다. 최대 {BLOCKED_MAX_COUNT}개, 이름은 {BLOCKED_NAME_MAX_CHARS}자 이하입니다.
        </p>
        <textarea
          id="blocked"
          name="blocked"
          rows={6}
          defaultValue={blocked.join("\n")}
          className="rounded-xl border border-line bg-surface px-4 py-2.5 text-base"
        />
        <button type="submit" className="self-start rounded-xl bg-accent-strong hover:bg-accent px-5 py-2 text-sm font-medium text-on-accent">저장</button>
      </form>

      <div className="flex flex-col gap-1 text-sm">
        <h2 className="font-medium">질문에서 &quot;항상 제외&quot;로 고른 주제</h2>
        {alwaysExcluded.length === 0 ? (
          <p className="text-subtle">아직 없습니다.</p>
        ) : (
          <ul className="list-inside list-disc text-muted">
            {alwaysExcluded.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/my" className="text-sm underline">← 트리로 돌아가기</Link>
    </section>
  );
}
