// Design Ref: DESIGN.md §10 — 한도 숫자는 PRD 5번 must 1의 값을 이 한 곳에만 둔다.
// 숫자를 바꿀 때 코드와 테스트가 함께 따라오게 하려는 것이다.
export const CARD_LIMITS = {
  summaryMaxChars: 500,
  evidenceMaxCount: 3,
  evidenceMaxChars: 300,
  keywordsMaxCount: 7,
  candidatesMaxCount: 3,
} as const;

/** 개념 트리의 한도. 단계·이름 길이는 데이터베이스에도 같은 한도가 걸려 있다(supabase/migrations/…_concept_tree.sql). */
export const CONCEPT_LIMITS = {
  /** 뿌리(상위 개념)를 1단계로 센 최대 단계 수 */
  maxDepth: 5,
  nameMaxChars: 30,
  /** 사용자 한 명이 가질 수 있는 개념 수(제안·거절 포함). 분류가 끝없이 가지를 늘리는 것을 막는다 */
  maxTotal: 300,
} as const;

/** 한 대화에서 만들 수 있는 카드 수. 데이터베이스에도 같은 한도가 걸려 있다. (supabase/migrations) */
export const CARDS_PER_CONVERSATION_MAX = 10;

/** Claude가 근거로 확인되지 않은 문장 끝에 붙이는 표기 */
export const ESTIMATE_MARKER = "(추정)";

/** 커넥터(기록·조회) 호출에만 적용하는 요청 크기·횟수 한도. */
export const REQUEST_LIMITS = {
  maxBytes: 20 * 1024,
  perMinute: 30,
  perDay: 500,
} as const;
