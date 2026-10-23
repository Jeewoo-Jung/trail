import { describe, expect, it } from "vitest";
import { verifyOwnerToken } from "./owner-auth";

const OWNER = "11111111-1111-4111-8111-111111111111";
const good = async () => ({ sub: OWNER, clientId: "claude", scope: "openid email" });

describe("verifyOwnerToken", () => {
  it("서명이 맞고 내 계정이면 통과한다", async () => {
    const info = await verifyOwnerToken("tok", OWNER, good);
    expect(info).toMatchObject({ token: "tok", clientId: "claude", scopes: ["openid", "email"], extra: { userId: OWNER } });
  });
  it("다른 사람의 유효한 토큰은 거절한다", async () => {
    expect(await verifyOwnerToken("tok", OWNER, async () => ({ sub: "22222222-2222-4222-8222-222222222222" }))).toBeUndefined();
  });
  it("서명 검증이 실패하거나 던지면 거절한다", async () => {
    expect(await verifyOwnerToken("tok", OWNER, async () => null)).toBeUndefined();
    expect(await verifyOwnerToken("tok", OWNER, async () => { throw new Error("bad"); })).toBeUndefined();
  });
  it("토큰이 없거나 내 계정 번호 설정이 없으면 거절한다", async () => {
    expect(await verifyOwnerToken(undefined, OWNER, good)).toBeUndefined();
    expect(await verifyOwnerToken("tok", undefined, good)).toBeUndefined();
    expect(await verifyOwnerToken("tok", "", good)).toBeUndefined();
  });
});
