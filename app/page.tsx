// Design Ref: DESIGN.md §3.4, §4.4 — 로그인 전에 누구나 보는 가상 샘플 화면.
// 코드 안의 가상 카드(lib/sample)만 그린다. 데이터베이스·로그인·비밀값을 쓰지 않으므로 내 데이터가 나올 길이 없다.
import Link from "next/link";
import { TrailMark } from "@/components/trail-mark";
import { ConceptTree } from "@/components/concept-tree";
import { buildTree } from "@/lib/rules/tree";
import { SAMPLE_CARDS, SAMPLE_CONCEPTS } from "@/lib/sample/sample-data";

export default function Home() {
  const tree = buildTree(SAMPLE_CARDS, SAMPLE_CONCEPTS);
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
          <h1 className="text-5xl font-semibold md:text-7xl">개념 트리 둘러보기</h1>
          <p className="max-w-2xl text-xl text-muted md:text-2xl">Claude와 나눈 대화에서 정한 결정을 개념 트리로 모아 봅니다. 아래는 지어낸 예시입니다.</p>
          <Link href="/login" className="text-lg text-accent hover:underline">
            내 기록 보러 가기 ›
          </Link>
        </section>
        <section className="rounded-[1.75rem] bg-surface p-5 md:p-8">
          <ConceptTree tree={tree} />
        </section>
      </main>
    </>
  );
}
