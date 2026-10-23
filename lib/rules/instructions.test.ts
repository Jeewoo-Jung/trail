// 사용자 지침 문서의 숫자가 코드의 한도와 어긋나지 않게 지킨다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARD_LIMITS, CARDS_PER_CONVERSATION_MAX, ESTIMATE_MARKER, REQUEST_LIMITS } from "./limits";

const text = readFileSync(new URL("../../instructions/trail-record-rules.md", import.meta.url), "utf8");
// 설명문 속에도 같은 표시가 나오므로 줄 처음에 있는 표시만 찾는다.
const body = text.slice(text.indexOf("\n=== 붙여 넣기 시작 ==="), text.indexOf("\n=== 붙여 넣기 끝 ==="));

describe("instructions/trail-record-rules.md", () => {
  it("코드의 한도와 같은 숫자를 적고 있다", () => {
    expect(body).toContain(`**${CARD_LIMITS.summaryMaxChars}자 이하**`);
    expect(body).toContain(`최대 ${CARD_LIMITS.evidenceMaxCount}개, 각 ${CARD_LIMITS.evidenceMaxChars}자`);
    expect(body).toContain(`최대 ${CARD_LIMITS.keywordsMaxCount}개`);
    expect(body).toContain(`최대 ${CARD_LIMITS.candidatesMaxCount}개`);
    expect(body).toContain(`최대 **${CARDS_PER_CONVERSATION_MAX}장**`);
    expect(body).toContain(`분당 ${REQUEST_LIMITS.perMinute}회, 하루 ${REQUEST_LIMITS.perDay}회`);
    expect(body).toContain(`${REQUEST_LIMITS.maxBytes / 1024}KB`);
    expect(body).toContain(ESTIMATE_MARKER);
  });
  it("주제 목록은 지침에 적지 않고 list_cards의 projectTopics를 따르게 한다", () => {
    expect(body).toContain("projectTopics");
    expect(body).not.toContain("{내 주제 목록}");
  });
  it("실제 도구 이름과 입력 칸 이름을 쓰고 있다", () => {
    for (const name of ["list_cards", "record_cards", "questionCount", "excludeTopics", "topicKey", "cardId", "conversationKey".replace("conversationKey", "대화 키")]) expect(body).toContain(name);
  });
});
