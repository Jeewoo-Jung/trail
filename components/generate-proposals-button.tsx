"use client";

import { useFormStatus } from "react-dom";

/** 눌러서 Claude가 제안을 만드는 동안(몇 초) 글자를 바꿔 보여 준다. */
export function GenerateProposalsButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-xl border border-line-strong hover:bg-surface-hover px-4 py-1.5 text-xs font-medium disabled:opacity-50">
      {pending ? "제안 만드는 중…" : "정리 제안 받기"}
    </button>
  );
}
