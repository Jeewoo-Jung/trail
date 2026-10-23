import { describe, expect, it } from "vitest";
import { dayWindowStart, decideRate, isRequestTooLarge, minuteWindowStart } from "./rate-limit";

describe("요청 크기", () => {
  it("20KB(20480바이트)까지는 허용하고 1바이트라도 넘으면 거절한다", () => {
    expect(isRequestTooLarge(20 * 1024)).toBe(false);
    expect(isRequestTooLarge(20 * 1024 + 1)).toBe(true);
  });
});

describe("호출 횟수", () => {
  it("분당 30번째는 허용, 31번째는 거절", () => {
    expect(decideRate(30, 30)).toEqual({ ok: true });
    expect(decideRate(31, 31)).toEqual({ ok: false, reason: "minute" });
  });
  it("하루 500번째는 허용, 501번째는 거절", () => {
    expect(decideRate(1, 500)).toEqual({ ok: true });
    expect(decideRate(1, 501)).toEqual({ ok: false, reason: "day" });
  });
  it("둘 다 넘으면 하루 한도를 먼저 알린다", () => {
    expect(decideRate(31, 501)).toEqual({ ok: false, reason: "day" });
  });
});

describe("집계 구간", () => {
  it("분 구간은 초·밀리초를 버린다", () => {
    expect(minuteWindowStart(new Date("2026-10-23T03:04:59.999Z")).toISOString()).toBe("2026-10-23T03:04:00.000Z");
  });
  it("하루 구간은 한국 시간 자정(UTC 15시)에 바뀐다", () => {
    expect(dayWindowStart(new Date("2026-10-23T14:59:59Z")).toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(dayWindowStart(new Date("2026-10-23T15:00:00Z")).toISOString()).toBe("2026-10-23T15:00:00.000Z");
  });
});
