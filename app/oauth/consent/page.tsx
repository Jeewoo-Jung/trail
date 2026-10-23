// Design Ref: DESIGN.md §4.3 — Claude 커넥터가 내 데이터에 접근하려 할 때 내가 승인하는 화면.
// 이름·돌아갈 주소·권한을 보여 주고, 내가 승인한 것만 토큰을 받는다. 로그인하지 않았으면 proxy.ts가 로그인 화면으로 보낸다.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { describeScopes, isOwner, isValidAuthorizationId, redirectHost } from "@/lib/auth/consent";
import { createClient } from "@/lib/supabase/server";
import { approve, deny } from "./actions";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function ConsentPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">연결 승인</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <Consent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Consent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const id = params.authorization_id;
  if (!isValidAuthorizationId(id)) return <Message text="승인 요청 정보가 올바르지 않습니다. 연결을 시작한 곳에서 다시 시도해 주세요." />;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return <Message text="승인 요청을 찾지 못했습니다. 만료됐을 수 있으니 연결을 처음부터 다시 시도해 주세요." />;
  // 이미 승인한 클라이언트면 곧바로 돌려보낸다.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const owner = isOwner(user.id, process.env.OWNER_USER_ID);
  const host = redirectHost(data.redirect_uri);
  const scopes = describeScopes(data.scope);

  return (
    <section className="flex flex-col gap-5">
      {params.error === "owner" && <p role="alert" className="text-sm text-red-600">이 계정은 승인할 수 없습니다.</p>}
      {params.error === "1" && <p role="alert" className="text-sm text-red-600">처리하지 못했습니다. 다시 시도해 주세요.</p>}
      <p>
        <strong>{data.client.name || "이름 없는 앱"}</strong>
        이(가) 내 Trail 기록에 접근하려고 합니다.
      </p>
      <dl className="flex flex-col gap-3 rounded-lg border border-black/15 p-4 text-sm dark:border-white/20">
        <div>
          <dt className="font-medium">돌아갈 주소</dt>
          <dd className="break-all text-zinc-600 dark:text-zinc-400">{host ?? "알 수 없음"}</dd>
        </div>
        <div>
          <dt className="font-medium">요청한 권한</dt>
          <dd>
            <ul className="list-inside list-disc text-zinc-600 dark:text-zinc-400">
              {scopes.map((s) => (
                <li key={s.name}>
                  {s.label} <span className="text-xs text-zinc-500">({s.name})</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="font-medium">로그인한 계정</dt>
          <dd className="text-zinc-600 dark:text-zinc-400">{user.email ?? "알 수 없음"}</dd>
        </div>
      </dl>
      <p className="text-xs text-zinc-500">낯선 이름이나 주소라면 승인하지 말고 거절하세요.</p>
      {!owner && <p role="alert" className="text-sm text-red-600">이 계정은 Trail의 주인 계정이 아니라서 승인할 수 없습니다.</p>}
      <div className="flex gap-3">
        <form action={approve}>
          <input type="hidden" name="authorization_id" value={id} />
          <button type="submit" disabled={!owner} className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black">
            승인
          </button>
        </form>
        <form action={deny}>
          <input type="hidden" name="authorization_id" value={id} />
          <button type="submit" className="rounded-full border border-black/15 px-5 py-2 text-sm font-medium dark:border-white/20">
            거절
          </button>
        </form>
      </div>
    </section>
  );
}

function Message({ text }: { text: string }) {
  return <p className="text-sm text-zinc-600 dark:text-zinc-400">{text}</p>;
}
