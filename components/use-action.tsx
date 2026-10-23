"use client";

// 편집 버튼 한 묶음의 "처리 중"과 결과 문구를 다룬다.
import { useState, useTransition } from "react";
import type { EditResult } from "@/lib/my/node-edit";

export type ActionMessage = { ok: boolean; text: string } | null;

export function useAction() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<ActionMessage>(null);
  const run = (job: () => Promise<EditResult>, onOk?: (r: EditResult) => void) =>
    start(async () => {
      const result = await job();
      setMessage(result.ok ? (result.message ? { ok: true, text: result.message } : null) : { ok: false, text: result.message });
      if (result.ok) onOk?.(result);
    });
  return { pending, message, run, clear: () => setMessage(null) };
}

export function Message({ message }: { message: ActionMessage }) {
  if (!message) return null;
  return (
    <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-ok" : "text-danger"}`}>
      {message.text}
    </p>
  );
}
