// Design Ref: DESIGN.md §4.1 ④·§8 — 카드를 저장하기 전에 키·토큰 모양의 문자열을 ●●●로 가린다.
//  - 대상: `sk-` 키, `ghp_`·`github_pat_`·`gho_` 등 GitHub 토큰, `sbp_`, `sb_secret_`, `vcp_`, AWS(`AKIA…`)·Google(`AIza…`)·Slack(`xox…`) 키, `eyJ…`로 시작하는 토큰, `Bearer 긴 문자열`, `password=값` 같은 이름 붙은 비밀값.
//  - 지나치게 가리는 것도 문제라서, 이름에 우연히 들어 있는 글자(task-, ask-)와 짧은 단어는 건드리지 않는다.
//  - 이 모듈은 아무것도 기록(로그)하지 않는다. 가린 개수만 돌려준다.
import { findEstimates, type CheckedCard } from "./card";

export const MASK = "●●●";

// 단어 안쪽(task-…의 sk-)을 잡지 않도록, 앞이 글자·숫자가 아닐 때만 시작으로 본다.
// 하이픈·밑줄 바로 뒤(token-ghp_…)는 시작으로 본다. 그래야 이어 붙여 쓴 토큰을 놓치지 않는다.
const EDGE = "(^|[^A-Za-z0-9])";

const PREFIXED_RULES: RegExp[] = [
  // sk-: `sk-learn-pipeline`처럼 숫자 없는 긴 단어는 키가 아니라고 보고 남긴다. 진짜 키에는 숫자가 들어 있다.
  new RegExp(`${EDGE}sk-(?=[A-Za-z0-9_-]*\\d)[A-Za-z0-9_-]{20,}`, "g"),
  new RegExp(`${EDGE}ghp_[A-Za-z0-9]{20,}`, "g"),
  new RegExp(`${EDGE}sbp_[A-Za-z0-9]{20,}`, "g"),
  new RegExp(`${EDGE}vcp_[A-Za-z0-9]{20,}`, "g"),
  // Supabase 비밀 키, GitHub 토큰(세밀 토큰과 gho_/ghs_/ghu_/ghr_), AWS 접근 키, Google API 키, Slack 토큰
  new RegExp(`${EDGE}sb_secret_[A-Za-z0-9_-]{16,}`, "g"),
  new RegExp(`${EDGE}github_pat_[A-Za-z0-9_]{20,}`, "g"),
  new RegExp(`${EDGE}gh[ousr]_[A-Za-z0-9]{20,}`, "g"),
  new RegExp(`${EDGE}(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Za-z])`, "g"),
  new RegExp(`${EDGE}AIza[0-9A-Za-z_-]{35}`, "g"),
  new RegExp(`${EDGE}xox[abprs]-[A-Za-z0-9-]{10,}`, "g"),
  // eyJ…: 점으로 이어진 JWT를 먼저 잡고, 점 없이 길게 이어진 것도 잡는다.
  new RegExp(`${EDGE}eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}(?:\\.[A-Za-z0-9_-]{10,})?`, "g"),
  new RegExp(`${EDGE}eyJ[A-Za-z0-9_-]{40,}`, "g"),
];

// Bearer 뒤의 긴 문자열. "Bearer authentication-scheme-header" 같은 설명 글을 가리지 않도록 숫자가 있을 때만 본다.
const BEARER_RULE = /\b(Bearer)\s+(?=[A-Za-z0-9._~+/=-]*\d)[A-Za-z0-9._~+/=-]{16,}/gi;

// `password=값`, `api_key: 값`처럼 이름과 함께 적힌 비밀값. 값에 숫자가 있고 8자 이상일 때만 본다(설명 글을 가리지 않도록).
// 이름과 구분 기호는 남기고 값만 가린다.
const ASSIGNMENT_RULE = /(\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)["']?\s*[=:]\s*["']?)(?=[A-Za-z0-9_.+/=-]*\d)[A-Za-z0-9_.+/=-]{8,}/gi;

export type MaskResult = { text: string; count: number };

/** 글에서 키·토큰 모양 문자열을 가리고, 가린 개수를 함께 돌려준다. 같은 글에 다시 적용해도 결과가 같다. */
export function maskSecrets(text: string): MaskResult {
  let count = 0;
  let masked = text;

  for (const rule of PREFIXED_RULES) {
    masked = masked.replace(rule, (_match, edge: string) => {
      count += 1;
      return edge + MASK;
    });
  }
  masked = masked.replace(ASSIGNMENT_RULE, (_match, head: string) => {
    count += 1;
    return `${head}${MASK}`;
  });
  masked = masked.replace(BEARER_RULE, (_match, word: string) => {
    count += 1;
    return `${word} ${MASK}`;
  });

  return { text: masked, count };
}

/**
 * 검사를 통과한 카드의 글 칸을 모두 훑어 비밀값을 가린다.
 * 카드 id는 앱이 만든 값이라 건드리지 않는다.
 */
export function maskCard(card: CheckedCard): { card: CheckedCard; maskedCount: number } {
  let maskedCount = 0;
  const mask = (text: string): string => {
    const result = maskSecrets(text);
    maskedCount += result.count;
    return result.text;
  };

  const summary = mask(card.summary);
  const masked: CheckedCard = {
    ...card,
    topicKey: mask(card.topicKey),
    title: mask(card.title),
    summary,
    // 가린 뒤 같아진 개념어는 하나로 합쳐서 "중복 없음"을 지킨다.
    keywords: [...new Set(card.keywords.map(mask))],
    evidence: card.evidence.map(mask),
    candidates: card.candidates.map((candidate) => ({
      ...candidate,
      top: mask(candidate.top),
      sub: candidate.sub === null ? null : mask(candidate.sub),
    })),
    ...(card.projectTopic !== undefined ? { projectTopic: mask(card.projectTopic) } : {}),
    // 추정 문장 안에 비밀값이 있었다면 그대로 새어 나가지 않도록 가린 요약에서 다시 찾는다.
    estimates: card.noEvidence ? [] : findEstimates(summary),
    notes: [...card.notes],
  };

  if (maskedCount > 0) {
    masked.notes.push(
      `비밀값처럼 보이는 문자열 ${maskedCount}곳을 가려서 저장합니다. 키·비밀번호는 기록하지 않아야 합니다.`,
    );
  }
  return { card: masked, maskedCount };
}
