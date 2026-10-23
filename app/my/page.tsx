import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "./actions";

// 지금은 로그인이 되는지 확인하기 위한 자리다. 개념 트리 화면은 PLAN 14번에서 이곳에 만든다.
export default function MyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-5xl font-bold tracking-tight">Trail</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <SignedIn />
      </Suspense>
    </main>
  );
}

// 화면에서도 로그인을 다시 확인한다. proxy.ts는 빠른 확인일 뿐이다.
async function SignedIn() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <section className="flex flex-col gap-4">
      <p>
        로그인했습니다{user.email ? `: ${user.email}` : ""}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        개념 트리 화면은 아직 없습니다. (PLAN 14번에서 만듭니다.)
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-full border border-black/15 px-5 py-2 text-sm font-medium dark:border-white/20"
        >
          로그아웃
        </button>
      </form>
    </section>
  );
}
