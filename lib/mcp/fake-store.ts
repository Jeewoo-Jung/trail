// 시험용 가짜 저장소. 메모리에만 저장하고, 실제 데이터베이스의 규칙(같은 주제 중복 불가, 대화당 10장)도 흉내 낸다.
// 앱 코드에서는 쓰지 않는다. 기록·조회 로직의 규칙을 빠르게 시험하려고 만들었다.
import { cleanTopicList } from "../rules/topic";
import { CARDS_PER_CONVERSATION_MAX } from "../rules/limits";
import {
  type CardContent,
  type CardStore,
  type CardSummary,
  type ConceptLists,
  type ConversationInfo,
  type Exclusions,
  type StoredCard,
  StoreError,
} from "./store";

type Behavior = {
  /** true면 저장·수정할 때 오류를 낸다. 오류 메시지에 카드 내용이 섞여 있는 경우를 흉내 낸다. */
  failWrites?: boolean;
};

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

export class FakeStore implements CardStore {
  cards = new Map<string, StoredCard>();
  conversations = new Map<string, { key: string; questionCount: number }>();
  exclusions: Exclusions = { alwaysExcluded: [], blocked: [] };
  concepts: ConceptLists = { concepts: [] };
  updateCalls = 0;
  insertCalls = 0;

  constructor(private readonly behavior: Behavior = {}) {}

  private cardCount(conversationKey: string): number {
    return [...this.cards.values()].filter((card) => card.conversationKey === conversationKey).length;
  }

  async getExclusions(): Promise<Exclusions> {
    return { alwaysExcluded: [...this.exclusions.alwaysExcluded], blocked: [...this.exclusions.blocked] };
  }

  projectTopics: string[] = [];

  async getProjectTopics(): Promise<string[]> {
    return [...this.projectTopics];
  }

  async addAlwaysExcluded(topics: string[]): Promise<void> {
    this.exclusions.alwaysExcluded = cleanTopicList([...this.exclusions.alwaysExcluded, ...topics]);
  }

  async getConversation(key: string): Promise<ConversationInfo | null> {
    return this.conversations.has(key) ? { key, cardCount: this.cardCount(key) } : null;
  }

  async openConversation(key: string | undefined, questionCount: number): Promise<ConversationInfo | null> {
    if (key === undefined) {
      const created = newId();
      this.conversations.set(created, { key: created, questionCount });
      return { key: created, cardCount: 0 };
    }
    const existing = this.conversations.get(key);
    if (!existing) return null;
    existing.questionCount = Math.max(existing.questionCount, questionCount);
    return { key, cardCount: this.cardCount(key) };
  }

  questionCountOf(key: string): number | undefined {
    return this.conversations.get(key)?.questionCount;
  }

  async findCardById(id: string): Promise<StoredCard | null> {
    return this.cards.get(id) ?? null;
  }

  async findCardByTopic(conversationKey: string, topicKey: string): Promise<StoredCard | null> {
    return [...this.cards.values()].find((c) => c.conversationKey === conversationKey && c.topicKey === topicKey) ?? null;
  }

  async insertCard(conversationKey: string, card: CardContent): Promise<{ id: string }> {
    this.insertCalls += 1;
    if (this.behavior.failWrites) throw new StoreError(`카드 저장 (실패한 줄: ${card.title} ${card.summary})`, "XX000");
    if (await this.findCardByTopic(conversationKey, card.topicKey)) throw new StoreError("카드 저장", "23505");
    if (this.cardCount(conversationKey) >= CARDS_PER_CONVERSATION_MAX) throw new StoreError("카드 저장", "23514");
    const id = newId();
    this.cards.set(id, { id, conversationKey, projectTopic: null, ...card, ...(card.projectTopic === undefined ? {} : { projectTopic: card.projectTopic }) });
    return { id };
  }

  async updateCard(id: string, card: CardContent): Promise<void> {
    this.updateCalls += 1;
    if (this.behavior.failWrites) throw new StoreError(`카드 수정 (실패한 줄: ${card.title})`, "XX000");
    const current = this.cards.get(id);
    if (!current) throw new StoreError("카드 수정", "PGRST116");
    this.cards.set(id, { ...current, ...card, projectTopic: card.projectTopic ?? null });
  }

  async listCards(conversationKey: string): Promise<CardSummary[]> {
    return [...this.cards.values()]
      .filter((card) => card.conversationKey === conversationKey)
      .map(({ id, topicKey, title }) => ({ id, topicKey, title }));
  }

  async listConcepts(): Promise<ConceptLists> {
    return { concepts: this.concepts.concepts.map((c) => ({ ...c, path: [...c.path] })) };
  }
}
