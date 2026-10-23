"use client";

// Design Ref: DESIGN.md §4.6 — 화면이 열려 있는 동안 카드·하위 개념의 변경을 구독해서, 바뀌면 목록을 다시 읽는다(10초 목표).
// 구독도 로그인 권한(RLS) 아래에서 내 행만 받는다. 삭제 알림에는 권한 필터가 없으므로 알림 내용은 쓰지 않고 "바뀌었다"는 신호로만 쓴다.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function RealtimeStatus() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // 짧은 시간에 여러 번 바뀌어도 한 번만 다시 읽는다.
    const refreshSoon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };
    let wasConnected = false;
    const channel = supabase
      .channel("trail-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "nodes" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "node_fields" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "field_suggestions" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "outputs" }, refreshSoon)
      .subscribe((status) => {
        const ok = status === "SUBSCRIBED";
        setConnected(ok);
        // 끊겼다가 다시 연결되면 그 사이에 놓친 변경을 메우려고 처음부터 다시 읽는다.
        if (ok && wasConnected === false) {
          wasConnected = true;
          refreshSoon();
        } else if (!ok) {
          wasConnected = false;
        }
      });
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshSoon();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <span className="flex items-center gap-2 text-xs text-subtle" role="status">
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-ok" : "bg-subtle"}`} />
      {connected ? "실시간 연결됨" : "연결 끊김"}
    </span>
  );
}
