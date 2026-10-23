import { describe, expect, it } from "vitest";
import { readAll } from "./load-nodes";

describe("readAll: 1000줄씩 끝까지 읽는다(넘으면 오류 없이 잘리는 것을 막는다)", () => {
  const fake = (total: number) => {
    const calls: [number, number][] = [];
    const page = async (from: number, to: number) => {
      calls.push([from, to]);
      return { data: Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i), error: null };
    };
    return { page, calls };
  };
  it("한 쪽에 다 들어오면 한 번만 읽는다", async () => {
    const { page, calls } = fake(5);
    expect(await readAll("읽기", page)).toHaveLength(5);
    expect(calls).toEqual([[0, 999]]);
  });
  it("1000줄을 넘으면 다음 쪽을 이어 읽고 빠짐·중복이 없다", async () => {
    const { page, calls } = fake(2500);
    const rows = await readAll("읽기", page);
    expect(rows).toHaveLength(2500);
    expect(new Set(rows).size).toBe(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("정확히 1000줄이면 한 번 더 읽어 끝을 확인하고, 오류는 던진다", async () => {
    const { page, calls } = fake(1000);
    expect(await readAll("읽기", page)).toHaveLength(1000);
    expect(calls).toHaveLength(2);
    await expect(readAll("읽기", async () => ({ data: null, error: { code: "42P01" } }))).rejects.toThrow(/42P01/);
  });
});
