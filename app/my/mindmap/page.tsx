// Design Ref: PRD 5 should(마인드맵) — 트리와 같은 데이터를 점과 선으로 보여 주는 읽기 전용 화면.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Mindmap } from "@/components/mindmap";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadTree } from "@/lib/my/load-tree";
import { createClient } from "@/lib/supabase/server";

export default function MindmapPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">그래프</h1>
        <span className="text-sm text-subtle">읽기 전용 · 승인·거절·삭제는 트리 화면에서 합니다</span>
      </header>
      <Suspense fallback={<p className="text-sm text-subtle">불러오는 중…</p>}>
        <Loaded />
      </Suspense>
    </div>
  );
}

async function Loaded() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tree } = await loadTree(await createClient());
  return <Mindmap tree={tree} />;
}
