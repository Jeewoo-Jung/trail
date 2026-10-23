import { Suspense } from "react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClaudeClassifier } from "@/lib/claude/classifier";
import { ConceptTree } from "@/components/concept-tree";
import { Badge, buttonClass } from "@/components/ui";
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
import { approveConcept, approveTreeProposal, deleteCard, rejectConcept, rejectTreeProposal, requestTreeProposals } from "./actions";

export default function MyPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1 pb-2">
        <h1 className="text-2xl">내 기록</h1>
        <p className="max-w-xl text-sm text-muted">Claude와 나눈 대화의 결정이 개념 트리로 모입니다. 새 개념은 승인해야 확정돼요.</p>
      </header>
      <Suspense fallback={<p className="text-sm text-subtle">불러오는 중…</p>}>
        <SignedIn />
      </Suspense>
    </div>
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
      {ratio.warn && (
        <p role="alert" className="rounded-2xl border border-warn/60 bg-warn/10 p-4 text-sm">
          미분류 카드가 {Math.round(ratio.ratio * 100)}%입니다. 개념 트리를 다시 살펴보세요.
        </p>
      )}
      {proposals.length > 0 && (
        <section aria-label="승인 대기" className="flex flex-col gap-2 rounded-2xl border border-warn/60 bg-warn/10 p-4 text-sm">
          <h2 className="font-semibold">승인 대기 {proposals.length}</h2>
          <ul className="flex flex-col gap-2">
            {proposals.map((p) => (
              <li key={p.conceptId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  “{p.name}”{" "}
                  <span className="text-subtle">
                    ({p.parentPath.length > 0 ? `${p.parentPath.join(" > ")} 아래 신규` : "새 상위 개념"}, 카드 {p.cardCount}장{p.descendantCount > 0 ? `, 하위 ${p.descendantCount}개 포함` : ""})
                  </span>
                </span>
                <span className="flex gap-2">
                  <form action={approveConcept}>
                    <input type="hidden" name="concept_id" value={p.conceptId} />
                    <button type="submit" className={buttonClass.primary}>승인</button>
                  </form>
                  <form action={rejectConcept}>
                    <input type="hidden" name="concept_id" value={p.conceptId} />
                    <button type="submit" className={buttonClass.secondary}>거절</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="정리 제안" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">정리 제안 {treeProposals.length > 0 ? treeProposals.length : ""}</h2>
          <form action={requestTreeProposals}>
            <GenerateProposalsButton />
          </form>
        </div>
        {treeProposals.length === 0 ? (
          <p className="text-subtle">제안이 없습니다. 개념이 쌓인 뒤 &quot;정리 제안 받기&quot;를 누르면 Claude가 병합(같은 부모 아래 형제끼리)·분리(세부 개념으로 나누기)를 제안합니다. 승인하기 전에는 아무것도 바뀌지 않습니다.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {treeProposals.map((p) => (
              <li key={p.id} className="flex flex-col gap-2">
                <p>
                  <span className="mr-2"><Badge tone="info">{p.kind === "merge" ? "병합" : "분리"}</Badge></span>
                  {describeProposal(p)}
                </p>
                <span className="flex gap-2">
                  <form action={approveTreeProposal}>
                    <input type="hidden" name="proposal_id" value={p.id} />
                    <input type="hidden" name="kind" value={p.kind} />
                    <button type="submit" className={buttonClass.primary}>승인</button>
                  </form>
                  <form action={rejectTreeProposal}>
                    <input type="hidden" name="proposal_id" value={p.id} />
                    <button type="submit" className={buttonClass.secondary}>거절</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConceptTree tree={tree} deleteCard={deleteCard} approveConcept={approveConcept} rejectConcept={rejectConcept} />
    </section>
  );
}
