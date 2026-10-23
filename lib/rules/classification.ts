// Design Ref: DESIGN.md §4.1 ⑧ — Claude가 돌려준 분류 값(개념 경로)을 앱 규칙에 맞게 걸러 "어디에 붙이고 무엇을 새로 만들지"로 바꾼다.
// 개념은 부모-자식으로 이어지는 트리다. 경로를 뿌리부터 따라 내려가다가, 처음으로 없는 이름부터는 새 개념(제안)으로 만든다.
// 상위 개념(뿌리)도 새로 만들 수 있다. 다만 단계 수·이름 길이·전체 개수에는 한도가 있고, 거절한 이름은 다시 만들지 않는다.
import { countChars } from "./card";
import { CONCEPT_LIMITS } from "./limits";
import { normalizeTopic } from "./topic";

export const UNCLASSIFIED = "미분류";

export type ConceptStatus = "proposed" | "approved" | "rejected";
export type ConceptRef = { id: string; parentId: string | null; name: string; status: ConceptStatus };

export type Resolution = {
  /** 경로를 따라 내려가다 마지막으로 찾은 기존 개념. 없으면(뿌리 아래가 아니라 처음부터 새로 만들면) null */
  existingId: string | null;
  /** existingId 아래에 차례로 새로 만들 개념 이름들. 비어 있으면 existingId에 카드를 붙인다 */
  create: string[];
};

/** 분류기가 돌려준 값에서 경로를 꺼낸다. { path: [...] } 또는 옛 모양 { top, sub }를 받는다. 모양이 다르면 null. */
export function extractPath(raw: unknown): string[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { path, top, sub } = raw as { path?: unknown; top?: unknown; sub?: unknown };
  let names: unknown[];
  if (Array.isArray(path)) names = path;
  else if (typeof top === "string") names = [top, sub];
  else return null;
  const out: string[] = [];
  for (const n of names) {
    if (n === undefined || n === null) continue;
    if (typeof n !== "string") return null;
    out.push(n.normalize("NFC").replace(/\s+/g, " ").trim());
  }
  return out.filter((n) => n !== "");
}

export function resolveClassification(raw: unknown, concepts: readonly ConceptRef[]): Resolution {
  const none: Resolution = { existingId: null, create: [] };
  const extracted = extractPath(raw);
  if (extracted === null || extracted.length === 0) return none;
  if (normalizeTopic(extracted[0]) === normalizeTopic(UNCLASSIFIED)) return none;

  // 한도: 단계 수를 넘거나 이름이 너무 긴 곳에서 경로를 자른다.
  const names: string[] = [];
  for (const n of extracted) {
    if (names.length >= CONCEPT_LIMITS.maxDepth || countChars(n) > CONCEPT_LIMITS.nameMaxChars) break;
    names.push(n);
  }
  if (names.length === 0) return none;

  const children = new Map<string, ConceptRef>(); // `${부모 id}|${정규화한 이름}` → 개념
  for (const c of concepts) children.set(`${c.parentId ?? ""}|${normalizeTopic(c.name)}`, c);

  let current: string | null = null;
  for (let i = 0; i < names.length; i += 1) {
    const found = children.get(`${current ?? ""}|${normalizeTopic(names[i])}`);
    if (!found) {
      const create = names.slice(i);
      // 개념이 너무 많아지면 새로 만들지 않고 찾은 곳까지만 붙인다.
      if (concepts.length + create.length > CONCEPT_LIMITS.maxTotal) return { existingId: current, create: [] };
      return { existingId: current, create };
    }
    // 거절한 개념은 다시 만들거나 쓰지 않고, 그 부모에 붙인다.
    if (found.status === "rejected") return { existingId: current, create: [] };
    current = found.id;
  }
  return { existingId: current, create: [] };
}

export type ConceptPath = { id: string; path: string[]; status: "proposed" | "approved" };

/** 거절된 개념(과 그 아래)을 뺀 모든 개념의 경로. Claude에게 "지금 있는 개념"을 알려 줄 때 쓴다. */
export function listConceptPaths(concepts: readonly ConceptRef[]): ConceptPath[] {
  const byParent = new Map<string | null, ConceptRef[]>();
  for (const c of concepts) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  const out: ConceptPath[] = [];
  const walk = (parent: string | null, prefix: string[]) => {
    for (const c of (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
      if (c.status === "rejected") continue;
      const path = [...prefix, c.name];
      out.push({ id: c.id, path, status: c.status });
      walk(c.id, path);
    }
  };
  walk(null, []);
  return out;
}
