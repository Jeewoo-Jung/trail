// Design Ref: DESIGN.md §3.4, §4.4 — 로그인 전에 누구나 보는 가상 샘플 화면.
// 코드 안의 가상 카드(lib/sample)만 그린다. 데이터베이스·로그인·비밀값을 쓰지 않으므로 내 데이터가 나올 길이 없다.
import Link from "next/link";
import { ConceptTree } from "@/components/concept-tree";
import { buildTree } from "@/lib/rules/tree";
import { SAMPLE_CARDS, SAMPLE_SUBS, SAMPLE_TOPS } from "@/lib/sample/sample-data";

export default function Home() {
  const tree = buildTree(SAMPLE_CARDS, SAMPLE_TOPS, SAMPLE_SUBS);
  return (
    <>
      <div role="note" className="bg-warn/15 px-6 py-2 text-center text-sm font-medium text-warn">
        가상 샘플입니다. 내 기록이 아닙니다.
      </div>
      <header className="border-b border-line bg-sidebar">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-accent" />
            <span className="font-serif text-2xl text-fg">Trail</span>
          </span>
          <Link href="/login" className="rounded-xl bg-accent-strong px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent">
            로그인
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl">개념 트리 둘러보기</h1>
          <p className="max-w-2xl text-muted">Claude와 나눈 대화에서 정한 결정을 개념 트리로 모아 보는 개인용 앱입니다. 아래는 지어낸 예시입니다.</p>
        </div>
        <ConceptTree tree={tree} />
      </main>
    </>
  );
}
