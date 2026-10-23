import { describe, expect, it } from "vitest";
import { checkCard, countChars, findEstimates, type CardIssue, type CheckedCard } from "./card";
import { CARD_LIMITS } from "./limits";

const base = {
  topicKey: "임베딩-비교",
  title: "임베딩 비교 결론",
  summary: "두 방식을 비교해 결론을 냈다.",
  evidence: ["근거 한 줄"],
};

const chars = (n: number, ch = "가") => ch.repeat(n);

function ok(raw: unknown): CheckedCard {
  const result = checkCard(raw);
  if (!result.ok) throw new Error(`통과해야 하는 카드가 거절됨: ${JSON.stringify(result.issues)}`);
  return result.card;
}

function rejected(raw: unknown): CardIssue[] {
  const result = checkCard(raw);
  if (result.ok) throw new Error("거절돼야 하는 카드가 통과됨");
  return result.issues;
}

describe("한도 숫자", () => {
  it("PRD 5번 must 1의 값과 같다", () => {
    expect(CARD_LIMITS).toEqual({
      summaryMaxChars: 500,
      evidenceMaxCount: 3,
      evidenceMaxChars: 300,
      keywordsMaxCount: 7,
      candidatesMaxCount: 3,
    });
  });
});

describe("기본 모양", () => {
  it("필수 칸만 있어도 통과하고, 빠진 선택 칸은 빈 값으로 채운다", () => {
    const card = ok(base);
    expect(card.keywords).toEqual([]);
    expect(card.candidates).toEqual([]);
    expect(card.noEvidence).toBe(false);
    expect(card.estimates).toEqual([]);
    expect(card.notes).toEqual([]);
    expect(card.cardId).toBeUndefined();
    expect(card.projectTopic).toBeUndefined();
  });

  it("앞뒤 공백을 지우고, 카드 id와 프로젝트 주제는 그대로 넘긴다", () => {
    const card = ok({ ...base, title: "  제목  ", cardId: " abc ", projectTopic: " 연구 " });
    expect(card.title).toBe("제목");
    expect(card.cardId).toBe("abc");
    expect(card.projectTopic).toBe("연구");
  });

  it("비어 있는 카드 id와 프로젝트 주제는 없는 것으로 본다", () => {
    const card = ok({ ...base, cardId: "  ", projectTopic: "" });
    expect(card.cardId).toBeUndefined();
    expect(card.projectTopic).toBeUndefined();
  });

  it("모르는 칸은 버린다", () => {
    const card = ok({ ...base, 몰라: "무시" }) as Record<string, unknown>;
    expect(card["몰라"]).toBeUndefined();
  });

  it("제목과 주제 키가 비어 있으면 거절한다", () => {
    const issues = rejected({ ...base, title: "   ", topicKey: "" });
    expect(issues.map((i) => i.field).sort()).toEqual(["title", "topicKey"]);
  });

  it("형식이 틀려도 오류를 던지지 않고 거절한다", () => {
    expect(rejected({ ...base, summary: 123 }).map((i) => i.field)).toContain("summary");
    expect(rejected({ ...base, evidence: "문자열" }).map((i) => i.field)).toContain("evidence");
    expect(rejected({ topicKey: "k" }).map((i) => i.field)).toContain("title");
    expect(rejected(null)[0].field).toBe("card");
    expect(rejected("카드")[0].field).toBe("card");
  });
});

describe("요약 500자", () => {
  it("500자는 통과, 501자는 거절한다", () => {
    expect(ok({ ...base, summary: chars(500) }).summary).toHaveLength(500);
    const issues = rejected({ ...base, summary: chars(501) });
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("summary");
    expect(issues[0].message).toContain("500자");
    expect(issues[0].message).toContain("501자");
  });

  it("풀어 쓴 한글(NFD)도 사람이 세는 글자 수로 센다", () => {
    const decomposed = "가".normalize("NFD");
    expect(decomposed.length).toBeGreaterThan(1);
    expect(countChars(decomposed.repeat(500))).toBe(500);
    expect(ok({ ...base, summary: decomposed.repeat(500) }).summary).toHaveLength(500);
    expect(rejected({ ...base, summary: decomposed.repeat(501) })[0].field).toBe("summary");
  });

  it("이모지는 한 글자로 센다", () => {
    expect(countChars("😀".repeat(500))).toBe(500);
    expect(ok({ ...base, summary: "😀".repeat(500) }).noEvidence).toBe(false);
  });

  it("앞뒤 공백은 글자 수에 넣지 않는다", () => {
    expect(ok({ ...base, summary: ` ${chars(500)} ` }).summary).toHaveLength(500);
  });
});

describe("근거 발췌 3개·각 300자", () => {
  it("3개는 통과, 4개는 거절한다", () => {
    expect(ok({ ...base, evidence: ["a", "b", "c"] }).evidence).toHaveLength(3);
    const issues = rejected({ ...base, evidence: ["a", "b", "c", "d"] });
    expect(issues[0].field).toBe("evidence");
    expect(issues[0].message).toContain("3개");
  });

  it("한 개가 300자면 통과, 301자면 몇 번째인지 알려 주며 거절한다", () => {
    expect(ok({ ...base, evidence: [chars(300)] }).evidence).toHaveLength(1);
    const issues = rejected({ ...base, evidence: ["짧음", chars(301)] });
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("evidence.1");
    expect(issues[0].message).toContain("2번째");
  });

  it("빈 발췌는 세지 않고 버린다", () => {
    expect(ok({ ...base, evidence: ["", "  ", "근거"] }).evidence).toEqual(["근거"]);
    expect(ok({ ...base, evidence: ["a", "b", "c", "", " "] }).evidence).toHaveLength(3);
  });
});

describe("근거 없음", () => {
  it("근거가 0개면 거절하지 않고 요약을 비워서 통과시킨다", () => {
    const card = ok({ ...base, evidence: [] });
    expect(card.noEvidence).toBe(true);
    expect(card.summary).toBe("");
    expect(card.title).toBe(base.title);
    expect(card.notes).toHaveLength(1);
  });

  it("근거 칸이 아예 없거나 빈 글자뿐이어도 같다", () => {
    expect(ok({ topicKey: "k", title: "제목", summary: "요약" }).noEvidence).toBe(true);
    expect(ok({ ...base, evidence: ["", " "] }).summary).toBe("");
  });

  it("요약이 원래 비어 있으면 알림 없이 근거 없음만 표시한다", () => {
    const card = ok({ ...base, summary: "", evidence: [] });
    expect(card.noEvidence).toBe(true);
    expect(card.notes).toEqual([]);
  });

  it("근거가 없는 카드도 개념어와 분류 후보는 남긴다", () => {
    const card = ok({
      ...base,
      evidence: [],
      keywords: ["a"],
      candidates: [{ top: "연구", sub: null }],
    });
    expect(card.keywords).toEqual(["a"]);
    expect(card.candidates).toHaveLength(1);
  });

  it("근거가 없으면 요약이 500자를 넘어도 거절한다 (한도는 그대로 적용)", () => {
    expect(rejected({ ...base, summary: chars(501), evidence: [] })[0].field).toBe("summary");
  });

  it("요약을 비운 카드에서는 추정 표시를 찾지 않는다", () => {
    expect(ok({ ...base, summary: "이건 추측이다 (추정)", evidence: [] }).estimates).toEqual([]);
  });
});

describe("개념어 7개", () => {
  it("7개는 통과, 8개는 거절한다", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"];
    expect(ok({ ...base, keywords: seven }).keywords).toHaveLength(7);
    expect(rejected({ ...base, keywords: [...seven, "h"] })[0].field).toBe("keywords");
  });

  it("같은 개념어는 하나로 합치고 빈 것은 버린다", () => {
    const card = ok({ ...base, keywords: ["a", "a", " a ", "b", ""] });
    expect(card.keywords).toEqual(["a", "b"]);
    const eightWithDuplicates = ["a", "a", "b", "b", "c", "c", "d", "d"];
    expect(ok({ ...base, keywords: eightWithDuplicates }).keywords).toHaveLength(4);
  });
});

describe("분류 후보 3개 (개념 경로)", () => {
  const candidate = (...path: string[]) => ({ path });

  it("3개는 통과, 4개는 거절한다", () => {
    const three = [candidate("연구"), candidate("업무"), candidate("생활")];
    expect(ok({ ...base, candidates: three }).candidates).toHaveLength(3);
    expect(rejected({ ...base, candidates: [...three, candidate("기타")] })[0].field).toBe("candidates");
  });

  it("경로를 정리하고(공백·빈 이름 제거), 새 개념 표시는 기본이 아님이다", () => {
    const card = ok({ ...base, candidates: [{ path: [" 연구 ", "  ", "임베딩"] }, { path: ["업무"], isNew: true }] });
    expect(card.candidates).toEqual([
      { path: ["연구", "임베딩"], isNew: false },
      { path: ["업무"], isNew: true },
    ]);
  });

  it("옛 모양({ top, sub, isNewSub })도 경로로 바꿔 받는다", () => {
    const card = ok({ ...base, candidates: [{ top: " 연구 " }, { top: "업무", sub: "  " }, { top: "생활", sub: " 요리 ", isNewSub: true }] });
    expect(card.candidates).toEqual([
      { path: ["연구"], isNew: false },
      { path: ["업무"], isNew: false },
      { path: ["생활", "요리"], isNew: true },
    ]);
  });

  it("경로가 비어 있으면 몇 번째인지 알려 주며 거절한다", () => {
    const issues = rejected({ ...base, candidates: [candidate("연구"), candidate("  ")] });
    expect(issues[0].field).toBe("candidates.1.path");
    expect(issues[0].message).toContain("2번째");
  });

  it("5단계를 넘는 경로와 30자를 넘는 개념 이름은 거절한다", () => {
    expect(ok({ ...base, candidates: [candidate("1", "2", "3", "4", "5")] }).candidates).toHaveLength(1);
    expect(rejected({ ...base, candidates: [candidate("1", "2", "3", "4", "5", "6")] })[0].message).toContain("5단계");
    expect(rejected({ ...base, candidates: [candidate("가".repeat(31))] })[0].message).toContain("30자");
    expect(ok({ ...base, candidates: [candidate("가".repeat(30))] }).candidates).toHaveLength(1);
  });
});

describe("추정 표시 찾기", () => {
  it("(추정)으로 끝나는 문장만 찾는다", () => {
    expect(findEstimates("첫 문장이다. 이건 추측이다 (추정). 마지막이다.")).toEqual(["이건 추측이다 (추정)"]);
    expect(findEstimates("사실이다. 또 사실이다.")).toEqual([]);
    expect(findEstimates("")).toEqual([]);
  });

  it("여러 문장과 줄바꿈도 찾는다", () => {
    const found = findEstimates("A일 것이다 (추정)\nB도 그럴 것이다(추정)! C는 확인됐다.");
    expect(found).toEqual(["A일 것이다 (추정)", "B도 그럴 것이다(추정)"]);
  });

  it("검사를 거친 카드의 estimates에 담긴다", () => {
    const card = ok({ ...base, summary: "확인된 내용이다. 다음은 추측이다 (추정)." });
    expect(card.estimates).toEqual(["다음은 추측이다 (추정)"]);
  });

  it("근거 발췌 안의 (추정)은 찾지 않는다", () => {
    expect(ok({ ...base, evidence: ["원문에 (추정)이라고 적혀 있다"] }).estimates).toEqual([]);
  });
});

describe("거절 사유", () => {
  it("문제가 여러 개면 모두 알려 준다", () => {
    const issues = rejected({
      ...base,
      title: "",
      summary: chars(501),
      evidence: ["a", "b", "c", "d"],
      keywords: ["1", "2", "3", "4", "5", "6", "7", "8"],
    });
    expect(issues.map((i) => i.field).sort()).toEqual(["evidence", "keywords", "summary", "title"]);
  });

  it("사유에는 카드 내용을 넣지 않는다", () => {
    const secret = "비밀문장";
    const issues = rejected({ ...base, summary: secret + chars(500), evidence: [secret + chars(300)] });
    for (const issue of issues) expect(issue.message).not.toContain(secret);
  });
});
