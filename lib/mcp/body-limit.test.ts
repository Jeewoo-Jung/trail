import { describe, expect, it } from "vitest";
import { limitRequestBody } from "./body-limit";

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/mcp", { method: "POST", body, headers });

describe("limitRequestBody", () => {
  it("한도 이하면 본문을 그대로 다시 읽을 수 있게 돌려준다", async () => {
    const r = await limitRequestBody(post("가나다"), 100);
    if (!r.ok) throw new Error("통과해야 함");
    expect(r.bytes).toBe(9);
    expect(await r.request.text()).toBe("가나다");
  });
  it("한도를 넘으면 거절한다 (바이트 기준)", async () => {
    expect((await limitRequestBody(post("가".repeat(40)), 100)).ok).toBe(false); // 120바이트
    expect((await limitRequestBody(post("a".repeat(100)), 100)).ok).toBe(true);
    expect((await limitRequestBody(post("a".repeat(101)), 100)).ok).toBe(false);
  });
  it("content-length가 이미 한도를 넘는다고 알리면 읽지 않고 거절한다", async () => {
    expect((await limitRequestBody(post("x", { "content-length": "99999" }), 100)).ok).toBe(false);
  });
  it("본문이 없는 요청은 그대로 통과한다", async () => {
    const r = await limitRequestBody(new Request("http://localhost/api/mcp"), 100);
    expect(r.ok).toBe(true);
  });
});
