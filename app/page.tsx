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
      <div role="note" className="bg-amber-100 px-6 py-2 text-center text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
        가상 샘플입니다. 내 기록이 아닙니다.
      </div>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-5xl font-bold tracking-tight">Trail</h1>
            <p className="text-zinc-600 dark:text-zinc-400">Claude와 나눈 대화에서 정한 결정을 개념 트리로 모아 보는 개인용 앱입니다. 아래는 지어낸 예시입니다.</p>
          </div>
          <Link href="/login" className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            로그인
          </Link>
        </header>
        <ConceptTree tree={tree} />
      </main>
    </>
  );
}
