// 요청 크기와 호출 횟수 한도를 판단하는 순수 규칙. 저장·시계는 바깥에서 넣어 준다.
import { REQUEST_LIMITS } from "./limits";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
// 하루는 한국 시간 자정 기준이다. 한국은 일광절약시간이 없어 고정 +9시간이면 된다.
const KST_OFFSET_MS = 9 * 60 * 60_000;

export function minuteWindowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS);
}

export function dayWindowStart(now: Date): Date {
  return new Date(Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS);
}

export function isRequestTooLarge(byteLength: number): boolean {
  return byteLength > REQUEST_LIMITS.maxBytes;
}

export type RateDecision = { ok: true } | { ok: false; reason: "minute" | "day" };

/** 이번 호출까지 센 값(minuteCount, dayCount)이 한도를 넘었는지 본다. 한도와 같은 횟수까지는 허용한다. */
export function decideRate(minuteCount: number, dayCount: number): RateDecision {
  if (dayCount > REQUEST_LIMITS.perDay) return { ok: false, reason: "day" };
  if (minuteCount > REQUEST_LIMITS.perMinute) return { ok: false, reason: "minute" };
  return { ok: true };
}
