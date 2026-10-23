import { Suspense } from "react";
import { redirect } from "next/navigation";
import { NodeTreeView } from "@/components/node-tree-view";
import { Skeleton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadNodeData } from "@/lib/my/load-nodes";
import { createClient } from "@/lib/supabase/server";
import * as actions from "./actions";

export default function MyPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1 pb-2">
        <h1 className="text-4xl font-semibold">내 기록</h1>
        <p className="max-w-xl text-sm text-muted">Claude와 나눈 대화가 프로젝트·활동(STAR)으로 자동 정리됩니다. 모든 항목을 바로 고칠 수 있고, 고친 항목은 잠겨서 이후 기록이 덮어쓰지 않습니다.</p>
      </header>
      <Suspense fallback={<div className="flex flex-col gap-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40 w-full" /></div>}>
        <SignedIn />
      </Suspense>
    </div>
  );
}

// 화면에서도 로그인을 다시 확인한다. proxy.ts는 빠른 확인일 뿐이다.
async function SignedIn() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await loadNodeData(await createClient());
  return (
    <NodeTreeView
      data={data}
      actions={{
        create: actions.createNodeAction,
        update: actions.updateNodeAction,
        move: actions.moveNodeAction,
        unlock: actions.unlockNodeFieldAction,
        trash: actions.trashNodeAction,
        restore: actions.restoreNodeAction,
        purge: actions.purgeNodeAction,
        setField: actions.setFieldAction,
        setSubject: actions.setFieldSubjectAction,
        setLock: actions.setFieldLockAction,
        addEvidence: actions.addEvidenceAction,
        updateEvidence: actions.updateEvidenceAction,
        removeEvidence: actions.removeEvidenceAction,
        resolveSuggestion: actions.resolveSuggestionAction,
        addOutput: actions.addOutputAction,
        updateOutput: actions.updateOutputAction,
        removeOutput: actions.removeOutputAction,
        merge: actions.mergeActivitiesAction,
        split: actions.splitActivityAction,
      }}
    />
  );
}
