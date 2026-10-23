// Design Ref: DESIGN.md §8 — 커넥터 토큰을 확인한다: ① 서명이 맞는 Supabase 토큰인지 ② 그 사용자가 "나"인지.
// 토큰 값은 로그에 남기지 않는다. 확인에 실패하면 이유를 알리지 않고 거절(undefined)만 돌려준다.
export type VerifiedClaims = { sub: string; clientId?: string; scope?: string };

export type OwnerAuthInfo = { token: string; clientId: string; scopes: string[]; extra: { userId: string } };

export async function verifyOwnerToken(
  bearer: string | undefined,
  ownerId: string | undefined,
  verifyJwt: (token: string) => Promise<VerifiedClaims | null>,
): Promise<OwnerAuthInfo | undefined> {
  // 내 계정 번호가 설정돼 있지 않으면 아무도 통과시키지 않는다.
  if (!bearer || !ownerId) return undefined;
  let claims: VerifiedClaims | null;
  try {
    claims = await verifyJwt(bearer);
  } catch {
    return undefined;
  }
  if (!claims || claims.sub !== ownerId) return undefined;
  return {
    token: bearer,
    clientId: claims.clientId ?? "unknown",
    scopes: claims.scope ? claims.scope.split(" ").filter(Boolean) : [],
    extra: { userId: claims.sub },
  };
}
