// Design Ref: DESIGN.md §4.1 ⑧ — Claude가 돌려준 분류 값을 앱 규칙에 맞게 걸러 결정으로 바꾼다.
// 상위 개념은 내가 고정한 목록 안에서만 받고(새 상위 개념은 만들지 않는다), 하위 개념은 기존 것을 쓰거나 신규 제안으로 올린다.
import { countChars } from "./card";
import { normalizeTopic } from "./topic";

export const UNCLASSIFIED = "미분류";
export const SUB_NAME_MAX_CHARS = 30;

export type TopConceptRef = { id: string; name: string };
export type SubConceptRef = { id: string; topId: string; name: string; status: "proposed" | "approved" | "rejected" };

export type SubDecision = { kind: "existing"; id: string } | { kind: "propose"; name: string };
export type Decision = {
  topId: string | null; // null이면 "미분류"
  sub: SubDecision | null; // null이면 "하위 미정"
};

function isBlankOrUnclassified(name: string): boolean {
  const key = normalizeTopic(name);
  return key === "" || key === normalizeTopic(UNCLASSIFIED);
}

/** 규칙에 어긋난 출력(목록 밖 상위 개념, 모양이 다른 값)은 null로 돌려 "다시 분류" 대상으로 남긴다. */
export function decideClassification(
  raw: unknown,
  tops: readonly TopConceptRef[],
  subs: readonly SubConceptRef[],
): Decision | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { top, sub } = raw as { top?: unknown; sub?: unknown };
  if (typeof top !== "string") return null;
  if (sub !== undefined && sub !== null && typeof sub !== "string") return null;

  if (isBlankOrUnclassified(top)) return { topId: null, sub: null };
  const topKey = normalizeTopic(top);
  const matchedTop = tops.find((t) => normalizeTopic(t.name) === topKey);
  if (!matchedTop) return null;

  const subName = (sub ?? "").normalize("NFC").trim();
  if (isBlankOrUnclassified(subName)) return { topId: matchedTop.id, sub: null };

  const subKey = normalizeTopic(subName);
  const existing = subs.find((s) => s.topId === matchedTop.id && normalizeTopic(s.name) === subKey);
  if (existing) {
    // 거절한 이름은 다시 제안하지 않고 "하위 미정"으로 둔다.
    if (existing.status === "rejected") return { topId: matchedTop.id, sub: null };
    return { topId: matchedTop.id, sub: { kind: "existing", id: existing.id } };
  }
  if (countChars(subName) > SUB_NAME_MAX_CHARS) return { topId: matchedTop.id, sub: null };
  return { topId: matchedTop.id, sub: { kind: "propose", name: subName } };
}
