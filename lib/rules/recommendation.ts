// Design Ref: PRD 5 should(과거 대화 업로드 추천) — Claude가 낸 상위 개념·프로젝트 주제 후보를 규칙에 맞게 걸린다.
// 후보는 추천일 뿐이고, 내가 승인한 것만 저장된다.
import { countChars } from "./card";
import { cleanTopicList, normalizeTopic } from "./topic";

export const TOP_CONCEPTS_MAX_TOTAL = 10; // PRD: 상위 개념은 5~10개
export const CANDIDATE_NAME_MAX_CHARS = 30;
export const REASON_MAX_CHARS = 120;
export const TOP_CANDIDATES_MAX = 10;
export const TOPIC_CANDIDATES_MAX = 15;
export const PROJECT_TOPICS_MAX_TOTAL = 50;

export type Candidate = { name: string; reason: string };
export type Recommendation = { topConcepts: Candidate[]; projectTopics: Candidate[] };

const clip = (s: string, max: number) => (countChars(s) > max ? `${Array.from(s).slice(0, max - 1).join("")}…` : s);

function parseList(raw: unknown, existing: readonly string[], max: number): Candidate[] {
  if (!Array.isArray(raw) || max <= 0) return [];
  const seen = new Set(existing.map(normalizeTopic));
  const out: Candidate[] = [];
  for (const item of raw) {
    const name = typeof item?.name === "string" ? item.name.normalize("NFC").replace(/\s+/g, " ").trim() : "";
    const key = normalizeTopic(name);
    if (key === "" || countChars(name) > CANDIDATE_NAME_MAX_CHARS || seen.has(key)) continue;
    seen.add(key);
    const reason = typeof item?.reason === "string" ? clip(item.reason.replace(/\s+/g, " ").trim(), REASON_MAX_CHARS) : "";
    out.push({ name, reason });
    if (out.length >= max) break;
  }
  return out;
}

/** 이미 있는 상위 개념·프로젝트 주제와 겹치는 후보, 이름이 너무 긴 후보, 모양이 다른 값은 버린다. */
export function parseRecommendation(raw: unknown, existingTops: readonly string[], existingTopics: readonly string[]): Recommendation {
  const obj = typeof raw === "object" && raw !== null ? (raw as { topConcepts?: unknown; projectTopics?: unknown }) : {};
  const room = Math.max(0, TOP_CONCEPTS_MAX_TOTAL - existingTops.length);
  return {
    topConcepts: parseList(obj.topConcepts, existingTops, Math.min(TOP_CANDIDATES_MAX, room)),
    projectTopics: parseList(obj.projectTopics, existingTopics, TOPIC_CANDIDATES_MAX),
  };
}

export type ApprovedCheck = { ok: true; topConcepts: string[]; projectTopics: string[] } | { ok: false; message: string };

/** 승인해서 저장하려는 값을 다시 검사한다(화면에서 온 값이므로 서버에서 한도를 지킨다). */
export function checkApproved(topConcepts: readonly string[], projectTopics: readonly string[], existingTops: readonly string[], existingTopics: readonly string[]): ApprovedCheck {
  const tops = cleanTopicList(topConcepts).filter((n) => !existingTops.some((e) => normalizeTopic(e) === normalizeTopic(n)));
  const topics = cleanTopicList(projectTopics).filter((n) => !existingTopics.some((e) => normalizeTopic(e) === normalizeTopic(n)));
  if ([...tops, ...topics].some((n) => countChars(n) > CANDIDATE_NAME_MAX_CHARS)) return { ok: false, message: `이름은 ${CANDIDATE_NAME_MAX_CHARS}자 이하여야 합니다.` };
  if (existingTops.length + tops.length > TOP_CONCEPTS_MAX_TOTAL) return { ok: false, message: `상위 개념은 모두 ${TOP_CONCEPTS_MAX_TOTAL}개까지입니다. (지금 ${existingTops.length}개)` };
  if (existingTopics.length + topics.length > PROJECT_TOPICS_MAX_TOTAL) return { ok: false, message: `프로젝트 주제는 모두 ${PROJECT_TOPICS_MAX_TOTAL}개까지입니다.` };
  return { ok: true, topConcepts: tops, projectTopics: topics };
}
