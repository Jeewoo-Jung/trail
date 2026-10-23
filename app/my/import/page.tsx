// Design Ref: PRD 5 should(과거 대화 업로드 추천) — 한 번 올려서 상위 개념·프로젝트 주제 후보를 추천받고, 승인한 것만 저장한다.
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ImportFlow } from "@/components/import-flow";
import { getCurrentUser } from "@/lib/auth/current-user";

export default function ImportPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">과거 대화로 추천받기</h1>
        <Link href="/my" className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium dark:border-white/20">← 트리 화면</Link>
      </header>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Claude 앱에서 내보낸 대화 기록(conversations.json)을 한 번 올리면, 자주 나오는 영역과 프로젝트를 상위 개념·프로젝트 주제 후보로 추천합니다. 승인하기 전에는 아무것도 저장되지 않습니다.
      </p>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <Guarded />
      </Suspense>
    </main>
  );
}

async function Guarded() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ImportFlow />;
}
