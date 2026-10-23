// 공통 작은 부품(Button 모양·Badge·Skeleton·EmptyState). 색과 모서리는 globals.css의 토큰만 쓴다.
import type { ReactNode } from "react";

const BUTTON_BASE = "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-medium disabled:opacity-50";
/** 버튼 모양 글자 묶음. primary는 한 화면에 하나만(포인트색), 나머지는 secondary. */
export const buttonClass = {
  primary: `${BUTTON_BASE} bg-brand text-on-accent`,
  secondary: `${BUTTON_BASE} border border-line-strong text-fg hover:bg-surface-hover`,
  danger: `${BUTTON_BASE} border border-danger/50 text-danger hover:bg-danger/10`,
} as const;

const TONES = {
  neutral: "border-line-strong text-muted",
  warn: "border-warn/60 text-warn",
  info: "border-info/60 text-info",
  ok: "border-ok/60 text-ok",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${TONES[tone]}`}>{children}</span>;
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-surface-hover ${className}`} />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
    </div>
  );
}
