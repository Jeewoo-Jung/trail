import { describe, expect, it } from "vitest";
import { buildDigest, checkDigest, DIGEST_LIMITS, digestChars } from "./import-digest";

const FAKE_KEY = "sk-" + "aB3dE5fG7hJ9kL2mN4pQ6rS8".repeat(2);
const msg = (sender: string, text: string) => ({ sender, text, content: [{ type: "text", text }, { type: "thinking", thinking: "비밀 생각" }] });
const conv = (name: string, humans: string[], created = "2026-10-22T00:00:00Z") => ({
  name, created_at: created,
  chat_messages: humans.flatMap((t) => [msg("human", t), msg("assistant", "어시스턴트 답변")]),
});

describe("buildDigest", () => {
  it("내 말(human)만 뽑고 어시스턴트 답변·thinking은 넣지 않는다", () => {
    const d = buildDigest([conv("대화1", ["첫 질문", "둘째 질문"])])!;
    expect(d.conversations).toEqual([{ name: "대화1", messages: ["첫 질문", "둘째 질문"] }]);
    expect(JSON.stringify(d)).not.toMatch(/어시스턴트|비밀 생각/);
  });
  it("text 필드가 비면 text 블록을 이어 붙여 쓴다", () => {
    const d = buildDigest([{ name: "x", chat_messages: [{ sender: "human", text: "", content: [{ type: "text", text: "블록 본문" }] }] }])!;
    expect(d.conversations[0].messages).toEqual(["블록 본문"]);
  });
  it("메시지가 없는 대화는 버린다", () => {
    expect(buildDigest([conv("빈 대화", []), conv("있는 대화", ["질문"])])!.conversations.map((c) => c.name)).toEqual(["있는 대화"]);
  });
  it("키처럼 보이는 글자는 가려서 담는다", () => {
    const d = buildDigest([conv("대화", [`키는 ${FAKE_KEY} 입니다`])])!;
    expect(JSON.stringify(d)).not.toContain(FAKE_KEY);
    expect(d.conversations[0].messages[0]).toContain("●●●");
  });
  it("대표 대화만 고른다: 내 말이 많은 순, 같으면 최근 순, 최대 10개", () => {
    const many = Array.from({ length: 14 }, (_, i) => conv(`대화${i}`, Array.from({ length: i < 2 ? 5 : 1 }, (_, j) => `질문${j}`), `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`));
    const d = buildDigest(many)!;
    expect(d.conversations).toHaveLength(DIGEST_LIMITS.maxConversations);
    expect(d.conversations.slice(0, 2).map((c) => c.name)).toEqual(["대화1", "대화0"]);
    expect(d.conversations[2].name).toBe("대화13"); // 1개짜리 중 가장 최근
  });
  it("메시지 수·글자 수·전체 크기 한도를 지킨다", () => {
    const long = "가".repeat(1000);
    const d = buildDigest(Array.from({ length: 10 }, (_, i) => conv(`대화${i}`, Array.from({ length: 9 }, () => long))))!;
    for (const c of d.conversations) {
      expect(c.messages.length).toBeLessThanOrEqual(DIGEST_LIMITS.maxMessagesPerConversation);
      for (const m of c.messages) expect(Array.from(m).length).toBeLessThanOrEqual(DIGEST_LIMITS.maxCharsPerMessage);
    }
    expect(digestChars(d)).toBeLessThanOrEqual(DIGEST_LIMITS.maxTotalChars);
  });
  it("대화 목록 모양이 아니면 null", () => {
    for (const bad of [null, {}, "x", 3, [{ foo: 1 }]]) expect(buildDigest(bad)).toBeNull();
  });
});

describe("checkDigest (서버에서 다시 검사)", () => {
  it("정상 요약은 통과하고 키 모양 글자는 다시 가린다", () => {
    const d = checkDigest({ conversations: [{ name: "대화", messages: [`키 ${FAKE_KEY}`] }] })!;
    expect(JSON.stringify(d)).not.toContain(FAKE_KEY);
  });
  it("한도를 넘거나 모양이 다르면 null", () => {
    expect(checkDigest({ conversations: Array.from({ length: 11 }, () => ({ name: "a", messages: ["b"] })) })).toBeNull();
    expect(checkDigest({ conversations: [{ name: "a", messages: Array.from({ length: 7 }, () => "b") }] })).toBeNull();
    expect(checkDigest({ conversations: [] })).toBeNull();
    expect(checkDigest("x")).toBeNull();
    expect(checkDigest({ conversations: [{ name: "a", messages: [123] }] })).toBeNull();
  });
  it("너무 긴 메시지는 잘라서 받는다", () => {
    const d = checkDigest({ conversations: [{ name: "a", messages: ["가".repeat(600)] }] })!;
    expect(Array.from(d.conversations[0].messages[0]).length).toBe(DIGEST_LIMITS.maxCharsPerMessage);
  });
});
