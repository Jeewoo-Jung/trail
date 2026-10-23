import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { saveResultDays } from "./actions";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <h1 className="text-4xl font-semibold">설정</h1>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const { data } = await (await createClient()).from("settings").select("result_wait_days, result_snooze_days").maybeSingle();
  const error = typeof params.error === "string" ? params.error : null;
  return (
    <form action={saveResultDays} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg">결과 등록 알림</h2>
      <p className="text-sm text-muted">프로젝트에 새 기록이 이 일수보다 오래 없고 결과가 비어 있으면 &ldquo;결과 등록 대기&rdquo;로 보여 줍니다. (이메일·푸시 알림은 없습니다.)</p>
      <label className="flex flex-col gap-1 text-sm">
        새 기록이 없는 일수(1~365, 기본 7)
        <input name="wait_days" type="number" min={1} max={365} defaultValue={data?.result_wait_days ?? 7} className="w-40 rounded-xl border border-line bg-surface px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        &ldquo;나중에&rdquo;를 누르면 숨기는 일수(1~90, 기본 3)
        <input name="snooze_days" type="number" min={1} max={90} defaultValue={data?.result_snooze_days ?? 3} className="w-40 rounded-xl border border-line bg-surface px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {params.saved === "1" && <p role="status" className="text-sm text-ok">저장했습니다.</p>}
      <button type="submit" className="self-start rounded-full bg-brand px-5 py-2 text-sm font-medium text-on-accent">저장</button>
    </form>
  );
}
