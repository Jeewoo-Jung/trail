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

/**
 * 노드·활동 카드의 한도(DESIGN.md §14.2, PLAN 32). 데이터베이스에도 같은 한도의 안전망이 걸려 있다(supabase/migrations/…_nodes.sql).
 * STAR 항목별 글자 수는 읽기 좋은 길이와 카드 한 장 분량을 기준으로 정했다. 바꾸면 이 숫자와 테스트, DESIGN 14.2를 함께 고친다.
 */
export const NODE_LIMITS = {
  nameMaxChars: 60,
  descriptionMaxChars: 500,
  /** 뿌리를 1단계로 센 최대 단계 수. 상향식 묶기로 범주가 겹겹이 쌓일 수 있어 넉넉히 둔다 */
  maxDepth: 8,
  /** 사용자 한 명이 가질 수 있는 노드 수(휴지통 포함) */
  maxTotal: 1000,
  /** 노드 하나에 붙일 수 있는 산출물 수 */
  outputsMaxCount: 20,
  outputNameMaxChars: 100,
  urlMaxChars: 500,
} as const;

export const STAR_LIMITS = {
  situation: 300,
  task: 200,
  action: 500,
  result_conversation: 300,
  result_external: 300,
} as const;

/** 항목 하나에 붙일 수 있는 근거 수와 원문 발췌 길이 */
export const EVIDENCE_LIMITS = {
  maxPerField: 3,
  excerptMaxChars: 300,
  titleMaxChars: 100,
} as const;

/** 상향식 묶기 제안(PLAN 36): 같은 부모 아래 같은 종류의 형제가 이만큼 쌓이면 새 상위 노드를 제안할 수 있다 */
export const GROUP_LIMITS = {
  minSiblings: 4,
  /** 한 묶음에 넣을 수 있는 노드 수 */
  minChildren: 2,
  maxChildren: 8,
  /** 한 번 실행에서 만드는 제안 수(비용 한도) */
  maxProposalsPerRun: 3,
  /** 한 번 실행에서 Claude에게 보여 주는 묶음 후보(부모+종류) 수 */
  maxBucketsPerRun: 3,
  /** Claude에게 보내는 노드 수(한 후보당) */
  maxNodesPerBucket: 30,
} as const;
