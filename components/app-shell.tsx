"use client";

// Design Ref: DESIGN.md §12 — Claude 나이트 모드처럼 왼쪽 사이드바 + 가운데 본문. 좁은 화면에서는 위쪽 줄의 메뉴 버튼으로 사이드바를 연다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { RealtimeStatus } from "@/components/realtime-status";

const NAV = [
  { href: "/my", label: "개념 트리", icon: "M4 5h16M4 12h10M4 19h6" },
  { href: "/my/mindmap", label: "그래프", icon: "M12 8a2 2 0 100-4 2 2 0 000 4zM5 20a2 2 0 100-4 2 2 0 000 4zM19 20a2 2 0 100-4 2 2 0 000 4zM11 8l-5 8M13 8l5 8" },
  { href: "/my/import", label: "대화로 추천받기", icon: "M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" },
  { href: "/my/settings", label: "설정", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 002 1.2l.4 2.6h4l.4-2.6a7 7 0 002-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" },
] as const;

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function AppShell({ email, logout, children }: { email: string | null; logout: () => Promise<void>; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="주 메뉴" className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.href === "/my" ? pathname === "/my" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)} // 좁은 화면에서 메뉴를 고르면 닫는다
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${active ? "bg-surface-active text-fg" : "text-muted hover:bg-surface-hover hover:text-fg"}`}
          >
            <Icon d={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/my" className="flex items-center gap-2 px-2 pt-1" aria-label="Trail 홈">
        <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-accent" />
        <span className="font-serif text-2xl text-fg">Trail</span>
      </Link>
      {nav}
      <div className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-xs text-subtle">내려받기</p>
        <a href="/api/export?format=md" download className="rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-hover hover:text-fg">Markdown (.md)</a>
        <a href="/api/export?format=json" download className="rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-hover hover:text-fg">JSON (.json)</a>
      </div>
      <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
        <RealtimeStatus />
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-active text-sm text-fg">
            {(email ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted" title={email ?? undefined}>{email ?? "로그인함"}</span>
        </div>
        <form action={logout}>
          <button type="submit" className="w-full rounded-xl border border-line px-3 py-2 text-sm text-muted hover:bg-surface-hover hover:text-fg">로그아웃</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* 좁은 화면: 위쪽 줄 */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-sidebar px-4 py-3 md:hidden">
        <Link href="/my" className="flex items-center gap-2" aria-label="Trail 홈">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-accent" />
          <span className="font-serif text-xl text-fg">Trail</span>
        </Link>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="sidebar-panel" aria-label="메뉴 열기·닫기" className="rounded-xl border border-line p-2 text-muted">
          <Icon d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
        </button>
      </header>
      {open && (
        <div id="sidebar-panel" className="fixed inset-x-0 bottom-0 top-[57px] z-20 overflow-y-auto bg-sidebar md:hidden">
          {sidebar}
        </div>
      )}
      {/* 넓은 화면: 왼쪽 고정 사이드바 */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-sidebar md:block">{sidebar}</aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
