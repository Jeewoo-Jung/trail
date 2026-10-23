import { Suspense } from "react";
import { safeNextPath } from "@/lib/auth/next-path";
import { login } from "./actions";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-5xl font-bold tracking-tight">Trail</h1>
        <p className="text-zinc-600 dark:text-zinc-400">내 기록을 보려면 로그인하세요.</p>
      </header>
      {/* 주소의 값(searchParams)은 요청마다 달라서, 기다리는 동안 보일 자리를 따로 둔다. */}
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginForm({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const failed = params.error === "1";

  return (
    <form action={login} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        이메일
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
        />
      </label>
      {failed && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          이메일 또는 비밀번호가 맞지 않습니다.
        </p>
      )}
      <button
        type="submit"
        className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background transition-colors hover:opacity-85"
      >
        로그인
      </button>
    </form>
  );
}
