// 커넥터 호출 앞단 검사: ① 요청 크기 ② 호출 횟수. 넘으면 거절하고 이유만 알려 준다(요청 내용은 담지 않는다).
import { decideRate, dayWindowStart, isRequestTooLarge, minuteWindowStart } from "../rules/rate-limit";

export interface RateStore {
  /** 해당 구간의 호출 횟수를 1 올리고, 올린 뒤의 값을 돌려준다. */
  increment(kind: "minute" | "day", windowStart: Date): Promise<number>;
}

export type GuardResult = { ok: true } | { ok: false; message: string };

export async function guardRequest(store: RateStore, byteLength: number, now: Date = new Date()): Promise<GuardResult> {
  if (isRequestTooLarge(byteLength)) return { ok: false, message: "요청이 너무 커서(20KB 초과) 받지 않았습니다. 카드를 나눠서 다시 보내 주세요." };
  const minute = await store.increment("minute", minuteWindowStart(now));
  const day = await store.increment("day", dayWindowStart(now));
  const decision = decideRate(minute, day);
  if (decision.ok) return { ok: true };
  return {
    ok: false,
    message: decision.reason === "day" ? "오늘 호출 한도(500회)를 넘었습니다. 내일 다시 시도해 주세요." : "호출이 너무 잦습니다(분당 30회). 잠시 후 다시 시도해 주세요.",
  };
}
