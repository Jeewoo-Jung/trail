import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClaudeClassifier } from "@/lib/claude/classifier";
import { ConceptTree } from "@/components/concept-tree";
import { RealtimeStatus } from "@/components/realtime-status";
import { loadTree } from "@/lib/my/load-tree";
import { classifyPendingThenWaiting } from "@/lib/mcp/classify-card";
import { createSupabaseClassifyStore } from "@/lib/mcp/supabase-classify-store";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cardsOfNode, pendingProposals } from "@/lib/rules/tree";
import { unclassifiedRatio } from "@/lib/rules/unclassified";
import { GenerateProposalsButton } from "@/components/generate-proposals-button";
import { listPendingProposals } from "@/lib/my/tree-proposals";
import { describeProposal } from "@/lib/rules/tree-proposals";
import { approveSub, approveTreeProposal, deleteCard, logout, rejectSub, rejectTreeProposal, requestTreeProposals } from "./actions";

export default function MyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-16">
      <h1 className="text-5xl font-bold tracking-tight">Trail</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <SignedIn />
      </Suspense>
    </main>
  );
}

// 기록 직후 분류가 중간에 끊겨 이만큼 오래 "분류 중"으로 남은 카드는 화면을 열 때 다시 분류한다.
const STALE_PENDING_MS = 2 * 60_000;

// 화면에서도 로그인을 다시 확인한다. proxy.ts는 빠른 확인일 뿐이다.
async function SignedIn() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { tree } = await loadTree(supabase);
  const proposals = pendingProposals(tree);
  const treeProposals = await listPendingProposals(supabase);
  const ratio = unclassifiedRatio(cardsOfNode(tree, null));

  // 화면을 연 김에, 한도 때문에 미뤄 둔 "미분류(대기)" 카드를 다시 분류한다(DESIGN.md §4.5). 화면은 기다리지 않는다.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    after(async () => {
      try {
        await classifyPendingThenWaiting(createSupabaseClassifyStore(supabase), createClaudeClassifier(apiKey), { olderThanMs: STALE_PENDING_MS });
      } catch {
        console.error("[my] 대기 카드 다시 분류 실패");
      }
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <p className="text-zinc-600 dark:text-zinc-400">{user.email ?? "로그인함"}</p>
          <RealtimeStatus />
        </div>
        <span className="flex items-center gap-2">
          <a href="/api/export?format=md" download className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium dark:border-white/20">Markdown</a>
          <a href="/api/export?format=json" download className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium dark:border-white/20">JSON</a>
        </span>
        <Link href="/my/import" className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium dark:border-white/20">대화 추천</Link>
        <Link href="/my/mindmap" className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium dark:border-white/20">마인드맵</Link>
        <Link href="/my/settings" className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium dark:border-white/20">설정</Link>
        <form action={logout}>
          <button type="submit" className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium dark:border-white/20">
            로그아웃
          </button>
        </form>
      </div>
      {ratio.warn && (
        <p role="alert" className="rounded-lg border border-amber-500/60 p-3 text-sm">
          미분류 카드가 {Math.round(ratio.ratio * 100)}%입니다. 상위 개념을 다시 살펴보세요.
        </p>
      )}
      {proposals.length > 0 && (
        <section aria-label="승인 대기" className="flex flex-col gap-2 rounded-lg border border-amber-500/60 p-4 text-sm">
          <h2 className="font-semibold">승인 대기 {proposals.length}</h2>
          <ul className="flex flex-col gap-2">
            {proposals.map((p) => (
              <li key={p.subId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  “{p.name}” <span className="text-zinc-500">({p.topName} &gt; 신규, 카드 {p.cardCount}장)</span>
                </span>
                <span className="flex gap-2">
                  <form action={approveSub}>
                    <input type="hidden" name="sub_id" value={p.subId} />
                    <button type="submit" className="rounded-full bg-black px-4 py-1 text-xs font-medium text-white dark:bg-white dark:text-black">승인</button>
                  </form>
                  <form action={rejectSub}>
                    <input type="hidden" name="sub_id" value={p.subId} />
                    <button type="submit" className="rounded-full border border-black/15 px-4 py-1 text-xs font-medium dark:border-white/20">거절</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="정리 제안" className="flex flex-col gap-2 rounded-lg border border-black/15 p-4 text-sm dark:border-white/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">정리 제안 {treeProposals.length > 0 ? treeProposals.length : ""}</h2>
          <form action={requestTreeProposals}>
            <GenerateProposalsButton />
          </form>
        </div>
        {treeProposals.length === 0 ? (
          <p className="text-zinc-500">제안이 없습니다. 하위 개념이 쌓인 뒤 &quot;정리 제안 받기&quot;를 누르면 Claude가 병합·분리를 제안합니다. 승인하기 전에는 아무것도 바뀌지 않습니다.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {treeProposals.map((p) => (
              <li key={p.id} className="flex flex-col gap-2">
                <p>
                  <span className="mr-2 rounded-full border border-sky-500 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-400">{p.kind === "merge" ? "병합" : "분리"}</span>
                  {describeProposal(p)}
                </p>
                <span className="flex gap-2">
                  <form action={approveTreeProposal}>
                    <input type="hidden" name="proposal_id" value={p.id} />
                    <input type="hidden" name="kind" value={p.kind} />
                    <button type="submit" className="rounded-full bg-black px-4 py-1 text-xs font-medium text-white dark:bg-white dark:text-black">승인</button>
                  </form>
                  <form action={rejectTreeProposal}>
                    <input type="hidden" name="proposal_id" value={p.id} />
                    <button type="submit" className="rounded-full border border-black/15 px-4 py-1 text-xs font-medium dark:border-white/20">거절</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConceptTree tree={tree} deleteCard={deleteCard} approveSub={approveSub} rejectSub={rejectSub} />
    </section>
  );
}
