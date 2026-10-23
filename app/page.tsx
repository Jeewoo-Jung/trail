// Design Ref: DESIGN.md §3.4, §4.4 — 로그인 전에 누구나 보는 가상 샘플 화면.
// 코드 안의 가상 노드·활동 카드(lib/sample)만 그린다. 데이터베이스·로그인·비밀값을 쓰지 않으므로 내 데이터가 나올 길이 없다.
import Link from "next/link";
import { TrailMark } from "@/components/trail-mark";
import { NodeTreeView } from "@/components/node-tree-view";
import { StarDocumentView } from "@/components/star-document";
import { buildStarDocument } from "@/lib/rules/star-doc";
import { SAMPLE_NODE_DATA } from "@/lib/sample/sample-nodes";

export default function Home() {
  // 샘플 프로젝트를 최종 산출(STAR 문서)로 만들면 이런 모양이 된다(코드 안의 가상 데이터만 쓴다).
  const sampleDoc = buildStarDocument(SAMPLE_NODE_DATA, "s-p1");
  return (
    <>
      <div role="note" className="bg-surface-active px-4 py-2 text-center text-xs text-muted">
        가상 샘플입니다. 내 기록이 아닙니다.
      </div>
      <header className="nav-blur sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center justify-between px-4 md:px-6">
          <span className="flex items-center gap-2">
            <TrailMark size={22} className="text-fg" />
            <span className="text-base font-semibold text-fg">Trail</span>
          </span>
          <Link href="/login" className="rounded-full bg-brand px-4 py-1 text-sm font-medium text-on-accent">
            로그인
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 pb-24 pt-16 md:px-6 md:pt-24">
        <section className="flex flex-col items-center gap-5 text-center">
          <h1 className="text-5xl font-semibold md:text-7xl">프로젝트 기록 둘러보기</h1>
          <p className="max-w-2xl text-xl text-muted md:text-2xl">Claude와 나눈 대화를 프로젝트·활동(STAR)으로 모아 봅니다. 아래는 지어낸 예시입니다.</p>
          <Link href="/login" className="text-lg text-accent hover:underline">
            내 기록 보러 가기 ›
          </Link>
        </section>
        <section className="rounded-[1.75rem] bg-surface p-5 md:p-8">
          <NodeTreeView data={SAMPLE_NODE_DATA} />
        </section>
        {sampleDoc && (
          <section aria-label="STAR 문서 미리보기" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-3xl font-semibold">최종 산출은 STAR 문서</h2>
              <p className="max-w-2xl text-muted">프로젝트나 활동을 제출용 문서로 모아 봅니다. 제외한 노드는 자동으로 빠지고, 비어 있는 항목은 쓰지 않습니다. 로그인하면 Markdown·JSON으로 내려받을 수 있어요. (아래는 지어낸 예시입니다.)</p>
            </div>
            <StarDocumentView doc={sampleDoc} />
          </section>
        )}
      </main>
    </>
  );
}
