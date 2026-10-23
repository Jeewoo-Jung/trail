// Design Ref: DESIGN.md §4.1 ③~⑦, §6.1 ② — Claude가 보낸 카드 묶음을 검사해서 저장·갱신한다.
//   ③ 모양·한도 검사 → ④ 비밀값 가리기 → ⑤ 제외 주제 확인 → ⑥ 같은 주제 찾기 → ⑦ "분류 중"으로 저장
// ①②(토큰 확인, 요청 크기·횟수)는 앞 단계(PLAN 9·11·12번)가, ⑧⑨(분류 보정)는 PLAN 10번이 맡는다.
// 결과에는 카드의 id·주제 키와 이유만 담고, 요약·근거는 돌려주지 않는다.
import { z } from "zod";
import { checkCard } from "../rules/card";
import { CARDS_PER_CONVERSATION_MAX } from "../rules/limits";
import { maskCard } from "../rules/mask-secrets";
import { cleanTopicList, isExcludedTopic } from "../rules/topic";
import type { CardContent, CardStore, StoredCard } from "./store";

export const recordInputSchema = z.object({
  conversationKey: z.uuid().optional(),
  // 질문은 대화당 1회가 규칙이라, 정상 값은 0~1이다. 이상한 값만 걸러 내려고 넉넉한 상한을 둔다.
  questionCount: z.number().int().min(0).max(1000).optional(),
  excludeTopics: z.array(z.string()).optional(),
  cards: z.array(z.unknown()),
});

export type CardResult = {
  topicKey: string | null;
  cardId?: string;
  status: "created" | "updated" | "rejected" | "excluded";
  reasons?: string[];
  notes?: string[];
};

export type RecordOutput = {
  conversationKey: string;
  results: CardResult[];
  excludedTopics: string[];
};

export type RecordOutcome = { ok: true; output: RecordOutput } | { ok: false; errors: string[] };

const SAVE_FAILED = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

function peekTopicKey(raw: unknown): string | null {
  if (typeof raw === "object" && raw !== null && "topicKey" in raw) {
    const value = (raw as { topicKey: unknown }).topicKey;
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function toContent(card: CardContent): CardContent {
  return {
    topicKey: card.topicKey,
    title: card.title,
    summary: card.summary,
    keywords: card.keywords,
    evidence: card.evidence,
    candidates: card.candidates,
    ...(card.projectTopic !== undefined ? { projectTopic: card.projectTopic } : {}),
  };
}

function sameContent(stored: StoredCard, next: CardContent): boolean {
  const shape = (c: { title: string; summary: string; keywords: string[]; evidence: string[]; candidates: unknown; projectTopic?: string | null }) =>
    JSON.stringify([c.title, c.summary, c.keywords, c.evidence, c.candidates, c.projectTopic ?? null]);
  return shape(stored) === shape(next);
}

/**
 * 카드 묶음을 처리한다. 카드마다 결과가 따로 나오므로 일부가 거절돼도 나머지는 저장된다.
 * 대화·제외 목록을 읽는 단계의 저장소 오류는 그대로 던진다. (앞 단계가 "기록 실패"로 알린다.)
 */
export async function recordCards(store: CardStore, rawInput: unknown): Promise<RecordOutcome> {
  const parsed = recordInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => (issue.path.length > 0 ? issue.path.map(String).join(".") : "입력"));
    return { ok: false, errors: [...new Set(fields)].map((field) => `${field} 값이 없거나 형식이 올바르지 않습니다`) };
  }
  const input = parsed.data;

  const newlyExcluded = cleanTopicList(input.excludeTopics ?? []);
  if (newlyExcluded.length > 0) await store.addAlwaysExcluded(newlyExcluded);
  const exclusions = await store.getExclusions();
  const excludedTopics = cleanTopicList([...exclusions.alwaysExcluded, ...exclusions.blocked]);

  const conversation = await store.openConversation(input.conversationKey, input.questionCount ?? 0);
  if (!conversation) {
    return { ok: false, errors: ["알 수 없는 대화 키입니다. 대화 키 없이 다시 보내면 새로 발급합니다."] };
  }
  let cardCount = conversation.cardCount;

  const results: CardResult[] = [];
  for (const raw of input.cards) {
    const checked = checkCard(raw);
    if (!checked.ok) {
      results.push({ topicKey: peekTopicKey(raw), status: "rejected", reasons: checked.issues.map((issue) => issue.message) });
      continue;
    }
    const { card } = maskCard(checked.card);
    const topicKey = card.topicKey;
    const notes = [...card.notes];

    if (isExcludedTopic(topicKey, excludedTopics)) {
      results.push({ topicKey, status: "excluded" });
      continue;
    }

    try {
      let existing: StoredCard | null = null;
      if (card.cardId) {
        existing = await store.findCardById(card.cardId);
        if (!existing) {
          results.push({ topicKey, status: "rejected", reasons: ["카드 id를 찾지 못했습니다. id 없이 보내면 새 카드로 저장합니다."] });
          continue;
        }
        if (existing.conversationKey !== conversation.key) {
          results.push({ topicKey, status: "rejected", reasons: ["다른 대화의 카드라서 고칠 수 없습니다."] });
          continue;
        }
        const sameTopic = await store.findCardByTopic(conversation.key, topicKey);
        if (sameTopic && sameTopic.id !== existing.id) {
          results.push({ topicKey, status: "rejected", reasons: ["같은 주제 키의 다른 카드가 이미 있습니다."] });
          continue;
        }
      } else {
        existing = await store.findCardByTopic(conversation.key, topicKey);
      }

      if (existing) {
        if (sameContent(existing, card)) {
          results.push({ topicKey, cardId: existing.id, status: "updated", notes: [...notes, "바뀐 내용이 없어 그대로 둡니다."] });
        } else {
          await store.updateCard(existing.id, toContent(card));
          results.push({ topicKey, cardId: existing.id, status: "updated", ...(notes.length > 0 ? { notes } : {}) });
        }
        continue;
      }

      if (cardCount >= CARDS_PER_CONVERSATION_MAX) {
        results.push({ topicKey, status: "rejected", reasons: [`대화당 카드는 ${CARDS_PER_CONVERSATION_MAX}장까지입니다.`] });
        continue;
      }
      const { id } = await store.insertCard(conversation.key, toContent(card));
      cardCount += 1;
      results.push({ topicKey, cardId: id, status: "created", ...(notes.length > 0 ? { notes } : {}) });
    } catch {
      // 저장소 오류에는 카드 내용이 섞여 있을 수 있어서 이유는 일반 문구만 돌려준다.
      results.push({ topicKey, status: "rejected", reasons: [SAVE_FAILED] });
    }
  }

  return { ok: true, output: { conversationKey: conversation.key, results, excludedTopics } };
}
