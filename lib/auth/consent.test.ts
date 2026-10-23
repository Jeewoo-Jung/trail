import { describe, expect, it } from "vitest";
import { describeScopes, isOwner, isValidAuthorizationId, redirectHost } from "./consent";

describe("consent 규칙", () => {
  it("승인 요청 번호 모양 검사", () => {
    expect(isValidAuthorizationId("abc12345-XYZ_9")).toBe(true);
    for (const bad of [undefined, "", "short", "a b c d e f g h", "../etc/passwd", "a".repeat(201), ["x"]]) expect(isValidAuthorizationId(bad)).toBe(false);
  });
  it("돌아갈 주소는 호스트만 보여 준다", () => {
    expect(redirectHost("https://claude.ai/api/mcp/auth_callback?x=1")).toBe("claude.ai");
    expect(redirectHost("http://localhost:3000/cb")).toBe("localhost:3000");
    expect(redirectHost("not a url")).toBeNull();
  });
  it("권한을 한국어로 풀어 주고, 모르는 권한은 그대로 드러낸다", () => {
    expect(describeScopes("openid email  custom")).toEqual([
      { name: "openid", label: "내 계정 확인" },
      { name: "email", label: "이메일 주소 보기" },
      { name: "custom", label: "알 수 없는 권한" },
    ]);
  });
  it("내 계정만 통과하고 설정이 비면 아무도 통과하지 못한다", () => {
    expect(isOwner("u1", "u1")).toBe(true);
    expect(isOwner("u2", "u1")).toBe(false);
    expect(isOwner("u1", undefined)).toBe(false);
    expect(isOwner("", "")).toBe(false);
  });
});
