// Design Ref: DESIGN.md §4.3, §8 — 커넥터 승인 화면에 쓰는 작은 규칙들.

/** 승인 요청 번호는 주소로 들어오는 값이라 모양을 먼저 거른다. (영문·숫자·-_ 만, 길이 제한) */
export function isValidAuthorizationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(value);
}

/** 돌아갈 주소의 호스트만 보여 준다(경로·쿼리는 길고 헷갈리게 만들 수 있다). 주소가 아니면 null. */
export function redirectHost(redirectUri: string): string | null {
  try {
    const url = new URL(redirectUri);
    return url.host || url.protocol;
  } catch {
    return null;
  }
}

const SCOPE_LABELS: Record<string, string> = {
  openid: "내 계정 확인",
  email: "이메일 주소 보기",
  profile: "프로필 보기",
  phone: "전화번호 보기",
  offline_access: "로그인 유지(새로 고침)",
};

export function describeScopes(scope: string): { name: string; label: string }[] {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => ({ name, label: SCOPE_LABELS[name] ?? "알 수 없는 권한" }));
}

/** 이 계정이 내 계정인지. 설정이 비어 있으면 아무도 통과시키지 않는다. */
export function isOwner(userId: string, ownerId: string | undefined): boolean {
  return Boolean(ownerId) && userId === ownerId;
}
