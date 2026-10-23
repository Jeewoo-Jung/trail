// Design Ref: DESIGN.md §4.1 ⑤ — 주제 키가 제외 주제와 같은지는 "공백·대소문자 무시"로 비교한다.

/** 비교용으로 바꾼다: 글자를 합치고, 소문자로, 공백을 모두 없앤다. */
export function normalizeTopic(topic: string): string {
  return topic.normalize("NFC").toLowerCase().replace(/\s+/g, "");
}

/** 앞뒤 공백을 지우고, 빈 것을 버리고, 비교용으로 같은 것은 처음 것만 남긴다. */
export function cleanTopicList(topics: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const topic of topics) {
    const cleaned = topic.normalize("NFC").trim();
    const key = normalizeTopic(cleaned);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

export function isExcludedTopic(topicKey: string, excluded: readonly string[]): boolean {
  const target = normalizeTopic(topicKey);
  if (target === "") return false;
  return excluded.some((topic) => normalizeTopic(topic) === target);
}
