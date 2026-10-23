// Design Ref: PRD 5 should(마인드맵) — 트리와 같은 데이터를 점과 선으로 보여 주는 읽기 전용 화면.
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Mindmap } from "@/components/mindmap";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadTree } from "@/lib/my/load-tree";
import { createClient } from "@/lib/supabase/server";

export default function MindmapPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">마인드맵</h1>
        <Link href="/my" className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium dark:border-white/20">← 트리 화면</Link>
      </header>
      <p className="text-sm text-zinc-500">읽기 전용입니다. 승인·거절·삭제는 트리 화면에서 합니다.</p>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tree } = await loadTree(await createClient());
  return <Mindmap tree={tree} />;
}
