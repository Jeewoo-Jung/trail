import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it.each([
    ["/my", "/my"],
    ["/my/settings", "/my/settings"],
    ["/my?tab=1", "/my?tab=1"],
    ["/oauth/consent?authorization_id=abc123", "/oauth/consent?authorization_id=abc123"],
    ["  /my/settings  ", "/my/settings"],
  ])("이 앱 안의 허용된 주소는 그대로 쓴다: %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    ["https://evil.example/my"],
    ["http://evil.example"],
    ["//evil.example/my"],
    ["///evil.example"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["javascript:alert(1)"],
    ["my"],
    [""],
    ["   "],
  ])("바깥으로 나가거나 주소 모양이 아니면 기본 주소로 돌린다: %j", (input) => {
    expect(safeNextPath(input)).toBe("/my");
  });

  it("허용 목록에 없는 이 앱 안의 주소도 돌린다", () => {
    expect(safeNextPath("/login")).toBe("/my");
    expect(safeNextPath("/api/mcp")).toBe("/my");
    expect(safeNextPath("/")).toBe("/my");
  });

  it("허용 접두어로 시작하는 것처럼 보이는 다른 주소는 돌린다", () => {
    expect(safeNextPath("/mything")).toBe("/my");
    expect(safeNextPath("/my@evil.example")).toBe("/my");
    expect(safeNextPath("/oauthx/consent")).toBe("/my");
  });

  it("줄바꿈 등 제어 문자가 들어 있으면 돌린다", () => {
    expect(safeNextPath("/my\n/evil")).toBe("/my");
    expect(safeNextPath("/my\r\nSet-Cookie: x=1")).toBe("/my");
    expect(safeNextPath("/my\u0000")).toBe("/my");
  });

  it("글자가 아닌 값은 돌린다", () => {
    expect(safeNextPath(undefined)).toBe("/my");
    expect(safeNextPath(null)).toBe("/my");
    expect(safeNextPath(123)).toBe("/my");
    expect(safeNextPath(["/my"])).toBe("/my");
    expect(safeNextPath({})).toBe("/my");
  });

  it("기본 주소를 바꿀 수 있다", () => {
    expect(safeNextPath("https://evil.example", "/oauth/consent")).toBe("/oauth/consent");
  });
});
