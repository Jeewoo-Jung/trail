// Design Ref: DESIGN.md §14.5 — 마인드맵(그래프)은 보조 화면이다. 같은 노드 트리를 점과 선으로 보여 주는 읽기 전용 화면.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Mindmap, type MindmapInfo } from "@/components/mindmap";
import { Skeleton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadNodeData } from "@/lib/my/load-nodes";
import { toGraphSource } from "@/lib/rules/graph-layout";
import { buildNodeTree, flatten } from "@/lib/rules/node-tree";
import { hasStar, NODE_KIND_LABEL, STAR_FIELD_LABEL, STAR_FIELDS } from "@/lib/rules/nodes";
import { createClient } from "@/lib/supabase/server";

export default function MindmapPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-semibold">마인드맵</h1>
        <span className="text-sm text-subtle">보조 화면 · 읽기 전용 · 고치기는 &ldquo;내 기록&rdquo;에서 합니다</span>
      </header>
      <Suspense fallback={<Skeleton className="h-[70vh] w-full" />}>
        <Loaded />
      </Suspense>
    </div>
  );
}

const SUMMARY_CHARS = 120;

async function Loaded() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await loadNodeData(await createClient());
  const tree = buildNodeTree(data);
  const info: Record<string, MindmapInfo> = {};
  for (const n of flatten(tree.roots)) {
    const fields = hasStar(n.kind)
      ? STAR_FIELDS.flatMap((f) => {
          const row = data.fields.find((x) => x.nodeId === n.id && x.field === f);
          return row && row.text.trim() !== "" ? [{ label: STAR_FIELD_LABEL[f], text: Array.from(row.text).slice(0, SUMMARY_CHARS).join("") + (Array.from(row.text).length > SUMMARY_CHARS ? "…" : "") }] : [];
        })
      : [];
    info[n.id] = {
      name: n.name,
      kindLabel: NODE_KIND_LABEL[n.kind],
      path: n.path.join(" › "),
      period: n.startDate || n.endDate ? `${n.startDate ?? "?"} ~ ${n.endDate ?? "?"}` : "",
      description: n.description,
      fields,
      docHref: n.effectiveExcluded || !(n.kind === "project" || hasStar(n.kind)) ? null : `/my/documents?id=${n.id}`,
    };
  }
  return <Mindmap tree={toGraphSource(tree.roots)} info={info} />;
}
