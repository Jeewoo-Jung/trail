// 무조건 제외 목록 입력을 정리한다. 줄바꿈이나 쉼표로 나눈 주제 이름을 한 목록으로 만든다.
import { countChars } from "./card";
import { cleanTopicList } from "./topic";

export const BLOCKED_MAX_COUNT = 50;
export const BLOCKED_NAME_MAX_CHARS = 60;

export type BlockedParse = { ok: true; topics: string[] } | { ok: false; message: string };

export function parseBlockedInput(text: string): BlockedParse {
  const topics = cleanTopicList(text.split(/[\n,]/));
  if (topics.length > BLOCKED_MAX_COUNT) return { ok: false, message: `주제는 ${BLOCKED_MAX_COUNT}개까지 적을 수 있습니다. (지금 ${topics.length}개)` };
  const tooLong = topics.find((t) => countChars(t) > BLOCKED_NAME_MAX_CHARS);
  if (tooLong !== undefined) return { ok: false, message: `주제 이름은 ${BLOCKED_NAME_MAX_CHARS}자 이하여야 합니다.` };
  return { ok: true, topics };
}
