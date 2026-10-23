"use client";

// Design Ref: DESIGN.md §12 (Glass Iris) — 왼쪽 얇은 아이콘 레일 + 위쪽 바(이동 경로, 실시간 상태 알약, 내 메뉴) + 가운데 본문.
// 좁은 화면에서는 레일이 위쪽 바 아래의 가로 아이콘 줄이 되고, 위쪽 바는 두 줄로 나뉜다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Download, Network, Settings, TreeDeciduous, type LucideIcon } from "lucide-react";
import { RealtimeStatus } from "@/components/realtime-status";
import { TrailMark } from "@/components/trail-mark";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/my", label: "개념 트리", icon: TreeDeciduous },
  { href: "/my/mindmap", label: "그래프", icon: Network },
  { href: "/my/import", label: "대화로 추천받기", icon: Download },
  { href: "/my/settings", label: "설정", icon: Settings },
];

const isActive = (pathname: string, href: string) => (href === "/my" ? pathname === "/my" : pathname.startsWith(href));
const tile = (active: boolean) => `grid h-9 w-9 place-items-center rounded-xl ${active ? "bg-surface-active text-fg ring-1 ring-line-strong" : "text-muted hover:bg-surface-hover hover:text-fg"}`;

export function AppShell({ email, logout, children }: { email: string | null; logout: () => Promise<void>; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = NAV.find((n) => isActive(pathname, n.href))?.label ?? "개념 트리";

  const links = NAV.map((item) => {
    const active = isActive(pathname, item.href);
    return (
      <Link key={item.href} href={item.href} title={item.label} aria-label={item.label} aria-current={active ? "page" : undefined} className={tile(active)}>
        <item.icon size={18} strokeWidth={1.5} aria-hidden />
      </Link>
    );
  });

  return (
    <div className="flex min-h-screen">
      {/* 넓은 화면: 왼쪽 아이콘 레일 */}
      <aside className="sticky top-0 hidden h-screen w-14 shrink-0 flex-col items-center gap-3 border-r border-line bg-sidebar py-3 md:flex">
        <Link href="/my" aria-label="Trail 홈" className="grid h-9 w-9 place-items-center rounded-xl text-accent">
          <TrailMark size={24} />
        </Link>
        <nav aria-label="주 메뉴" className="mt-2 flex flex-col gap-2">{links}</nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-sidebar/80 px-4 py-2.5 backdrop-blur md:px-6">
          <Link href="/my" className="flex items-center gap-2 md:hidden" aria-label="Trail 홈">
            <TrailMark size={22} className="text-accent" />
            <span className="text-lg font-semibold text-fg">Trail</span>
          </Link>
          <nav aria-label="현재 위치" className="hidden items-center gap-2 text-sm text-muted md:flex">
            <span>Home</span>
            <span aria-hidden className="text-subtle">›</span>
            <span className="text-fg">{current}</span>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="rounded-full border border-line px-3 py-1.5"><RealtimeStatus /></div>
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="내 메뉴" className="grid h-9 w-9 place-items-center rounded-full border border-line-strong bg-surface-hover text-sm font-medium text-fg">
                {(email ?? "?").slice(0, 1).toUpperCase()}
              </button>
              {menuOpen && (
                <div role="menu" className="glass absolute right-0 top-11 z-40 flex w-60 flex-col gap-1 rounded-2xl bg-surface/95 p-2 text-sm">
                  <p className="truncate px-3 py-2 text-muted" title={email ?? undefined}>{email ?? "로그인함"}</p>
                  <a role="menuitem" href="/api/export?format=md" download className="rounded-xl px-3 py-2 text-muted hover:bg-surface-hover hover:text-fg">Markdown으로 내려받기</a>
                  <a role="menuitem" href="/api/export?format=json" download className="rounded-xl px-3 py-2 text-muted hover:bg-surface-hover hover:text-fg">JSON으로 내려받기</a>
                  <form action={logout} className="mt-1 border-t border-line pt-1">
                    <button type="submit" role="menuitem" className="w-full rounded-xl px-3 py-2 text-left text-muted hover:bg-surface-hover hover:text-fg">로그아웃</button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* 좁은 화면: 둘째 줄에 아이콘 */}
          <nav aria-label="주 메뉴" className="flex w-full items-center gap-2 md:hidden">{links}</nav>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
