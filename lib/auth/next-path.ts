// Design Ref: DESIGN.md §3.5·§4.3 — 로그인 뒤에 돌아갈 주소(next)를 안전한 것만 받는다.
// 바깥 사이트로 보내는 주소(//evil.com, https://…)를 허용하면 로그인 화면이 피싱에 쓰일 수 있어서
// 이 앱 안의 `/my`, `/oauth` 아래 주소만 통과시키고 나머지는 기본 주소로 돌린다.
const ALLOWED_PREFIXES = ["/my", "/oauth"] as const;

export function safeNextPath(raw: unknown, fallback = "/my"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();

  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  // 주소로 풀어 보았을 때 같은 사이트 안이어야 한다.
  try {
    if (new URL(value, "http://same-site.invalid").origin !== "http://same-site.invalid") return fallback;
  } catch {
    return fallback;
  }

  const path = value.split(/[?#]/)[0];
  const allowed = ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return allowed ? value : fallback;
}
