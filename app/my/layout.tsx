// Design Ref: DESIGN.md §12 — /my 아래 모든 화면이 같은 사이드바를 쓴다. 로그인 확인은 각 화면이 다시 하므로 여기서는 이메일만 읽는다.
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "./actions";

export default function MyLayout({ children }: LayoutProps<"/my">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <WithShell>{children}</WithShell>
    </Suspense>
  );
}

async function WithShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <AppShell email={user?.email ?? null} logout={logout}>
      {children}
    </AppShell>
  );
}
