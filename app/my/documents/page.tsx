// Design Ref: DESIGN.md §14.5 — 최종 산출: 프로젝트·활동별 STAR 문서 뷰와 Markdown/JSON 내려받기.
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { StarDocumentView } from "@/components/star-document";
import { buttonClass, EmptyState, Skeleton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadNodeData } from "@/lib/my/load-nodes";
import { buildNodeTree, flatten } from "@/lib/rules/node-tree";
import { buildStarDocument, type DocNode } from "@/lib/rules/star-doc";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1 pb-2">
        <h1 className="text-4xl font-semibold">STAR 문서</h1>
        <p className="max-w-xl text-sm text-muted">프로젝트나 활동을 골라 제출용 문서로 보고 내려받습니다. 제외한 노드와 휴지통의 노드는 자동으로 빠지고, 비어 있는 항목은 쓰지 않습니다. 걸러내야 할 내용은 제출하기 전에 직접 확인해 주세요.</p>
      </header>
      <Suspense fallback={<div className="flex flex-col gap-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40 w-full" /></div>}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const dl = (scope: string, format: "md" | "json") => `/api/export?scope=${scope}&format=${format}`;

/** 문서 안의 활동·세부활동 목록(활동 단위 내려받기용) */
const activitiesOf = (n: DocNode): DocNode[] => n.children.flatMap((c) => (c.kind === "activity" || c.kind === "subactivity" ? [c, ...activitiesOf(c)] : activitiesOf(c)));

async function Loaded({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const data = await loadNodeData(await createClient());
  const tree = buildNodeTree(data);

  // 고를 수 있는 문서: 전체, 제외가 아닌 프로젝트, 프로젝트 밖에 있는 활동
  const choices = flatten(tree.roots).filter((n) => !n.effectiveExcluded && (n.kind === "project" || (n.kind === "activity" && !hasProjectAncestor(tree, n.id))));
  const wanted = typeof params.id === "string" ? params.id : choices[0]?.id ?? "all";
  const doc = buildStarDocument(data, wanted === "all" ? null : wanted);

  return (
    <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
      <nav aria-label="문서 고르기" className="flex flex-col gap-1 text-sm">
        <Link href="/my/documents?id=all" aria-current={wanted === "all" ? "page" : undefined} className={`rounded-xl px-3 py-2 ${wanted === "all" ? "bg-surface-active" : "hover:bg-surface-hover"}`}>전체 기록</Link>
        {choices.map((c) => (
          <Link key={c.id} href={`/my/documents?id=${c.id}`} aria-current={wanted === c.id ? "page" : undefined} className={`rounded-xl px-3 py-2 ${wanted === c.id ? "bg-surface-active" : "hover:bg-surface-hover"}`}>
            <span className="text-[11px] text-subtle">{c.kind === "project" ? "프로젝트" : "활동"}</span> {c.name}
          </Link>
        ))}
        {choices.length === 0 && <p className="px-3 py-2 text-subtle">아직 문서로 만들 프로젝트나 활동이 없습니다.</p>}
      </nav>
      <section aria-label="문서" className="flex min-w-0 flex-col gap-4">
        {doc ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <a href={dl(wanted, "md")} download className={buttonClass.primary}>Markdown 내려받기</a>
              <a href={dl(wanted, "json")} download className={buttonClass.secondary}>JSON 내려받기</a>
            </div>
            <StarDocumentView doc={doc} />
            {activitiesOf(doc.root).length > 0 && (
              <section aria-label="활동 단위 내려받기" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-sm">
                <h2 className="text-base">활동 하나만 내려받기</h2>
                <ul className="flex flex-col gap-2">
                  {activitiesOf(doc.root).map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <a href={dl(a.id, "md")} download className="text-accent hover:underline">Markdown</a>
                      <a href={dl(a.id, "json")} download className="text-accent hover:underline">JSON</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <EmptyState title="이 문서를 만들 수 없습니다">없거나 휴지통·제외 상태인 노드입니다. 왼쪽에서 다른 문서를 골라 주세요.</EmptyState>
        )}
      </section>
    </div>
  );
}

function hasProjectAncestor(tree: ReturnType<typeof buildNodeTree>, id: string): boolean {
  for (let cur = tree.byId.get(id)?.parentId ? tree.byId.get(tree.byId.get(id)!.parentId!) : undefined; cur; cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined) {
    if (cur.kind === "project") return true;
  }
  return false;
}
