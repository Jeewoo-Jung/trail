// Design Ref: DESIGN.md §6.1 ① — 기록하기 전에 Claude가 먼저 부른다.
// 이 대화의 기존 카드, 고를 수 있는 개념, 제외 주제를 알려 줘서 중복 카드와 엉뚱한 분류를 줄인다.
import { z } from "zod";
import { cleanTopicList } from "../rules/topic";
import type { CardStore, CardSummary, ConceptLists } from "./store";

export const listInputSchema = z.object({
  conversationKey: z.uuid().optional(),
});

export type ListOutput = {
  conversationKey: string | null;
  /** id·주제 키·제목만 담는다. 요약과 근거는 돌려주지 않는다. */
  cards: CardSummary[];
  topConcepts: ConceptLists["topConcepts"];
  approvedSubConcepts: ConceptLists["approvedSubConcepts"];
  excludedTopics: string[];
  /** 내가 정한 프로젝트 주제. 여기 있는 주제의 결정은 묻지 않고 기록한다. 비어 있으면 아직 정하지 않은 것이다. */
  projectTopics: string[];
};

export type ListOutcome = { ok: true; output: ListOutput } | { ok: false; errors: string[] };

export async function listCards(store: CardStore, rawInput: unknown): Promise<ListOutcome> {
  const parsed = listInputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, errors: ["conversationKey 값이 올바르지 않습니다"] };
  }
  const { conversationKey } = parsed.data;

  let cards: CardSummary[] = [];
  if (conversationKey) {
    const conversation = await store.getConversation(conversationKey);
    if (!conversation) {
      return { ok: false, errors: ["알 수 없는 대화 키입니다. 대화 키 없이 호출하면 처음 기록하는 것으로 봅니다."] };
    }
    cards = await store.listCards(conversationKey);
  }

  const [concepts, exclusions, projectTopics] = await Promise.all([store.listConcepts(), store.getExclusions(), store.getProjectTopics()]);
  return {
    ok: true,
    output: {
      conversationKey: conversationKey ?? null,
      cards,
      topConcepts: concepts.topConcepts,
      approvedSubConcepts: concepts.approvedSubConcepts,
      excludedTopics: cleanTopicList([...exclusions.alwaysExcluded, ...exclusions.blocked]),
      projectTopics: cleanTopicList(projectTopics),
    },
  };
}
