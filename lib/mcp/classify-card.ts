// Design Ref: DESIGN.md §4.1 ⑧⑨, §4.5 — 카드를 Claude로 분류해 저장한다. 실패하면 "미분류(대기)"로 두고 기록은 막지 않는다.
// 서버 로그에는 카드 내용을 남기지 않는다(여기서는 아예 로그를 쓰지 않고 결과 종류만 돌려준다).
import { decideClassification } from "../rules/classification";
import type { CardForClassification, ClassifyStore } from "./classify-store";

/** Claude 호출을 대신하는 함수. 분류 값(JSON 모양)을 돌려주고, 한도·오류면 던진다. */
export type Classifier = (input: {
  card: CardForClassification;
  topConcepts: string[];
  approvedSubConcepts: { top: string; name: string }[];
}) => Promise<unknown>;

export type ClassifyOutcome = "done" | "waiting" | "missing";

export const RECLASSIFY_BATCH_MAX = 5;

export async function classifyCard(store: ClassifyStore, classifier: Classifier, cardId: string): Promise<ClassifyOutcome> {
  const card = await store.getCard(cardId);
  if (!card) return "missing";
  try {
    const [tops, subs] = await Promise.all([store.listTopConcepts(), store.listSubConcepts()]);
    const topName = new Map(tops.map((t) => [t.id, t.name]));
    const raw = await classifier({
      card,
      topConcepts: tops.map((t) => t.name),
      approvedSubConcepts: subs.flatMap((s) => (s.status === "approved" && topName.has(s.topId) ? [{ top: topName.get(s.topId)!, name: s.name }] : [])),
    });
    // 규칙에 맞지 않는 출력(목록 밖 상위 개념 등)은 새 상위 개념을 만들지 않고 "미분류"로 확정한다.
    // 한도 오류처럼 "대기"로 두면, 같은 이상한 출력이 반복될 때 뒤의 대기 카드까지 다시 분류되지 못하고 비용만 나간다.
    const decision = decideClassification(raw, tops, subs) ?? { topId: null, sub: null };
    let subId: string | null = null;
    if (decision.sub?.kind === "existing") subId = decision.sub.id;
    else if (decision.sub?.kind === "propose" && decision.topId) subId = await store.createSubProposal(decision.topId, decision.sub.name);
    await store.saveClassification(cardId, decision.topId, subId);
    return "done";
  } catch {
    await store.markWaiting(cardId);
    return "waiting";
  }
}

/** 대기 카드를 오래된 것부터 다시 분류한다. 한 장이라도 실패하면(한도에 다시 닿은 것으로 보고) 멈추고 나머지는 대기로 남긴다. */
export async function reclassifyWaiting(store: ClassifyStore, classifier: Classifier, limit = RECLASSIFY_BATCH_MAX): Promise<{ done: number; stillWaiting: number }> {
  const ids = await store.listWaitingCardIds(limit);
  let done = 0;
  for (const id of ids) {
    if ((await classifyCard(store, classifier, id)) !== "done") return { done, stillWaiting: ids.length - done };
    done += 1;
  }
  return { done, stillWaiting: 0 };
}

export const CLASSIFY_BATCH_MAX = 10;

/** 카드를 차례로 분류한다. 호출이 실패하면(한도 등) 거기서 멈추고, 아직 처리하지 못한 나머지도 "미분류(대기)"로 돌려 놓아 다시 분류될 수 있게 한다. */
async function classifyInOrder(store: ClassifyStore, classifier: Classifier, ids: readonly string[]): Promise<boolean> {
  for (let i = 0; i < ids.length; i += 1) {
    if ((await classifyCard(store, classifier, ids[i])) !== "waiting") continue;
    for (const rest of ids.slice(i + 1)) await store.markWaiting(rest);
    return false;
  }
  return true;
}

/**
 * "분류 중" 카드를 분류하고, 모두 성공했을 때만 대기 카드도 다시 분류한다(한도에 막혔는데 또 부르지 않기 위해).
 * olderThanMs를 주면 그보다 오래 "분류 중"에 머문 카드만 대상으로 한다 — 기록 직후 작업이 끊겨 남은 카드를 화면을 열 때 되살린다.
 */
export async function classifyPendingThenWaiting(store: ClassifyStore, classifier: Classifier, options: { olderThanMs?: number } = {}): Promise<void> {
  const ids = await store.listPendingCardIds(CLASSIFY_BATCH_MAX, options.olderThanMs);
  if (!(await classifyInOrder(store, classifier, ids))) return;
  await reclassifyWaiting(store, classifier);
}
