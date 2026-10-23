import { describe, expect, it } from "vitest";
import { unclassifiedRatio, type RatioInput } from "./unclassified";

const make = (done: number, unclassified: number, extra: RatioInput[] = []): RatioInput[] => [
  ...Array.from({ length: done - unclassified }, () => ({ status: "done" as const, topName: "연구" })),
  ...Array.from({ length: unclassified }, () => ({ status: "done" as const, topName: null })),
  ...extra,
];

describe("unclassifiedRatio", () => {
  it("20%를 넘으면(10장 이상) 경고한다", () => {
    expect(unclassifiedRatio(make(10, 3)).warn).toBe(true); // 30%
  });
  it("정확히 20%는 경고하지 않는다", () => {
    expect(unclassifiedRatio(make(10, 2))).toMatchObject({ ratio: 0.2, warn: false });
  });
  it("분류가 끝난 카드가 10장 미만이면 비율이 높아도 경고하지 않는다", () => {
    expect(unclassifiedRatio(make(9, 9)).warn).toBe(false);
  });
  it("분류 중·대기 카드는 세지 않는다", () => {
    const waiting = Array.from({ length: 20 }, () => ({ status: "waiting" as const, topName: null }));
    const pending = [{ status: "pending" as const, topName: null }];
    expect(unclassifiedRatio(make(10, 1, [...waiting, ...pending]))).toMatchObject({ done: 10, unclassified: 1, warn: false });
  });
  it("카드가 없으면 0", () => {
    expect(unclassifiedRatio([])).toEqual({ done: 0, unclassified: 0, ratio: 0, warn: false });
  });
});
