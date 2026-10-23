import { Suspense } from "react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClaudeClassifier } from "@/lib/claude/classifier";
import { ConceptTree } from "@/components/concept-tree";
import { loadTree } from "@/lib/my/load-tree";
import { reclassifyWaiting } from "@/lib/mcp/classify-card";
import { createSupabaseClassifyStore } from "@/lib/mcp/supabase-classify-store";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "./actions";

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

// 화면에서도 로그인을 다시 확인한다. proxy.ts는 빠른 확인일 뿐이다.
async function SignedIn() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { tree } = await loadTree(supabase);

  // 화면을 연 김에, 한도 때문에 미뤄 둔 "미분류(대기)" 카드를 다시 분류한다(DESIGN.md §4.5). 화면은 기다리지 않는다.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    after(async () => {
      try {
        await reclassifyWaiting(createSupabaseClassifyStore(supabase), createClaudeClassifier(apiKey));
      } catch {
        console.error("[my] 대기 카드 다시 분류 실패");
      }
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">{user.email ?? "로그인함"}</p>
        <form action={logout}>
          <button type="submit" className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium dark:border-white/20">
            로그아웃
          </button>
        </form>
      </div>
      <ConceptTree tree={tree} />
    </section>
  );
}
