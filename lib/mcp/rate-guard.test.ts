import { describe, expect, it } from "vitest";
import { guardRequest, type RateStore } from "./rate-guard";

function memoryStore(): RateStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    async increment(kind, windowStart) {
      const k = `${kind}|${windowStart.toISOString()}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return counts.get(k)!;
    },
  };
}
const T = new Date("2026-10-23T03:00:10Z");

describe("guardRequest", () => {
  it("크기가 넘으면 횟수를 세지 않고 거절한다", async () => {
    const store = memoryStore();
    const r = await guardRequest(store, 20 * 1024 + 1, T);
    expect(r.ok).toBe(false);
    expect(store.counts.size).toBe(0);
  });
  it("한 분에 30번은 통과하고 31번째는 거절한다", async () => {
    const store = memoryStore();
    for (let i = 0; i < 30; i++) expect((await guardRequest(store, 100, T)).ok).toBe(true);
    const r = await guardRequest(store, 100, T);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toContain("분당 30회");
  });
  it("다음 분이 되면 분 한도는 다시 시작한다", async () => {
    const store = memoryStore();
    for (let i = 0; i < 31; i++) await guardRequest(store, 100, T);
    expect((await guardRequest(store, 100, new Date("2026-10-23T03:01:05Z"))).ok).toBe(true);
  });
  it("하루 500번을 넘으면 거절한다", async () => {
    const store = memoryStore();
    let last = await guardRequest(store, 1, T);
    // 한 분에 하나씩 보내면 분 한도는 안 걸리고 하루 한도만 걸린다(같은 한국 날짜 안: 500분 < 남은 시간)
    for (let i = 1; i < 501; i++) last = await guardRequest(store, 1, new Date(T.getTime() + i * 60_000));
    expect(last.ok).toBe(false);
  });
});
