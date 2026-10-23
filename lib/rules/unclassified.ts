// Design Ref: DESIGN.md §5 — "미분류" 비율이 20%를 넘으면 상위 개념을 다시 살펴보라고 안내한다.
// 분류가 끝난 카드만 센다(분류 중·대기 카드는 한도 때문에 부풀 수 있다). 카드가 적을 때 깜빡이지 않게 10장 이상일 때만 안내한다.
export const UNCLASSIFIED_RATIO_LIMIT = 0.2;
export const UNCLASSIFIED_MIN_CARDS = 10;

export type RatioInput = { status: "pending" | "done" | "waiting"; path: readonly string[] };

export function unclassifiedRatio(cards: readonly RatioInput[]): { done: number; unclassified: number; ratio: number; warn: boolean } {
  const done = cards.filter((c) => c.status === "done");
  const unclassified = done.filter((c) => c.path.length === 0).length;
  const ratio = done.length === 0 ? 0 : unclassified / done.length;
  return { done: done.length, unclassified, ratio, warn: done.length >= UNCLASSIFIED_MIN_CARDS && ratio > UNCLASSIFIED_RATIO_LIMIT };
}
