// Design Ref: DESIGN.md §10 — 한도 숫자는 PRD 5번 must 1의 값을 이 한 곳에만 둔다.
// 숫자를 바꿀 때 코드와 테스트가 함께 따라오게 하려는 것이다.
export const CARD_LIMITS = {
  summaryMaxChars: 500,
  evidenceMaxCount: 3,
  evidenceMaxChars: 300,
  keywordsMaxCount: 7,
  candidatesMaxCount: 3,
} as const;

/** Claude가 근거로 확인되지 않은 문장 끝에 붙이는 표기 */
export const ESTIMATE_MARKER = "(추정)";
