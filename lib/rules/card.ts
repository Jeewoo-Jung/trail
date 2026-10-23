// Design Ref: DESIGN.md §4.1 ③ — Claude가 보낸 카드를 모양·한도로 검사한다.
//  - 한도를 넘은 카드는 사유와 함께 거절한다. 사유에는 숫자만 넣고 카드 내용은 넣지 않는다.
//  - 근거 발췌가 0개인 카드는 거절하지 않고 요약을 비워서 저장한다("근거 없음").
//  - "(추정)"은 Claude가 붙인 표기를 앱이 찾아서 보여 주기만 한다. 근거 여부는 코드가 판정하지 못한다.
import { z } from "zod";
import { CARD_LIMITS, ESTIMATE_MARKER } from "./limits";

const candidateInputSchema = z.object({
  top: z.string(),
  sub: z.string().nullable().optional(),
  isNewSub: z.boolean().optional(),
});

/** 모양(글자·배열 등)만 검사한다. 한도는 checkCard가 따로 본다. */
export const cardInputSchema = z.object({
  cardId: z.string().optional(),
  topicKey: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  evidence: z.array(z.string()).optional(),
  candidates: z.array(candidateInputSchema).optional(),
  projectTopic: z.string().optional(),
});

/** 상위 개념 하나와 하위 개념(기존 것, 신규 제안, 또는 없음)의 짝 */
export type ClassificationCandidate = {
  top: string;
  sub: string | null;
  isNewSub: boolean;
};

export type CheckedCard = {
  cardId?: string;
  topicKey: string;
  title: string;
  summary: string;
  keywords: string[];
  evidence: string[];
  candidates: ClassificationCandidate[];
  projectTopic?: string;
  /** 근거 발췌가 0개인 카드 (화면에 "근거 없음"으로 표시) */
  noEvidence: boolean;
  /** 요약 안에서 "(추정)"으로 끝나는 문장들 (화면에 "추정"으로 표시) */
  estimates: string[];
  /** Claude에게 알려 줄 참고 사항 (거절은 아니다) */
  notes: string[];
};

export type CardIssue = { field: string; message: string };

export type CardCheckResult =
  | { ok: true; card: CheckedCard }
  | { ok: false; issues: CardIssue[] };

/**
 * 글자 수를 센다. NFC로 합친 뒤 코드 포인트 단위로 세서,
 * 자모가 풀려 있는 한글이나 이모지가 섞여도 사람이 세는 글자 수와 맞춘다.
 */
export function countChars(text: string): number {
  return Array.from(text.normalize("NFC")).length;
}

const clean = (text: string): string => text.normalize("NFC").trim();
const cleanList = (items: string[]): string[] => items.map(clean).filter((item) => item !== "");
const unique = (items: string[]): string[] => [...new Set(items)];

const ESTIMATE_PATTERN = new RegExp(
  `[^.!?。\\n]*${ESTIMATE_MARKER.replace(/[()]/g, "\\$&")}`,
  "g",
);

/** 요약에서 "(추정)"으로 끝나는 문장을 찾는다. 없으면 빈 배열이다. */
export function findEstimates(summary: string): string[] {
  return (summary.match(ESTIMATE_PATTERN) ?? []).map((sentence) => sentence.trim());
}

function optionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = clean(value);
  return text === "" ? undefined : text;
}

export function checkCard(raw: unknown): CardCheckResult {
  const parsed = cardInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => {
        const field = issue.path.length > 0 ? issue.path.map(String).join(".") : "card";
        return { field, message: `${field} 값이 없거나 형식이 올바르지 않습니다` };
      }),
    };
  }

  const input = parsed.data;
  const issues: CardIssue[] = [];

  const title = clean(input.title);
  if (title === "") issues.push({ field: "title", message: "제목이 비어 있습니다" });

  const topicKey = clean(input.topicKey);
  if (topicKey === "") issues.push({ field: "topicKey", message: "주제 키가 비어 있습니다" });

  let summary = clean(input.summary ?? "");
  const summaryChars = countChars(summary);
  if (summaryChars > CARD_LIMITS.summaryMaxChars) {
    issues.push({
      field: "summary",
      message: `요약이 ${CARD_LIMITS.summaryMaxChars}자를 넘습니다 (현재 ${summaryChars}자)`,
    });
  }

  const evidence = cleanList(input.evidence ?? []);
  if (evidence.length > CARD_LIMITS.evidenceMaxCount) {
    issues.push({
      field: "evidence",
      message: `근거 발췌가 ${CARD_LIMITS.evidenceMaxCount}개를 넘습니다 (현재 ${evidence.length}개)`,
    });
  }
  evidence.forEach((text, index) => {
    const chars = countChars(text);
    if (chars > CARD_LIMITS.evidenceMaxChars) {
      issues.push({
        field: `evidence.${index}`,
        message: `근거 발췌 ${index + 1}번째가 ${CARD_LIMITS.evidenceMaxChars}자를 넘습니다 (현재 ${chars}자)`,
      });
    }
  });

  const keywords = unique(cleanList(input.keywords ?? []));
  if (keywords.length > CARD_LIMITS.keywordsMaxCount) {
    issues.push({
      field: "keywords",
      message: `개념어가 ${CARD_LIMITS.keywordsMaxCount}개를 넘습니다 (현재 ${keywords.length}개)`,
    });
  }

  const candidates: ClassificationCandidate[] = (input.candidates ?? []).map((candidate) => {
    const sub = candidate.sub === undefined || candidate.sub === null ? "" : clean(candidate.sub);
    return {
      top: clean(candidate.top),
      sub: sub === "" ? null : sub,
      isNewSub: candidate.isNewSub ?? false,
    };
  });
  if (candidates.length > CARD_LIMITS.candidatesMaxCount) {
    issues.push({
      field: "candidates",
      message: `분류 후보가 ${CARD_LIMITS.candidatesMaxCount}개를 넘습니다 (현재 ${candidates.length}개)`,
    });
  }
  candidates.forEach((candidate, index) => {
    if (candidate.top === "") {
      issues.push({
        field: `candidates.${index}.top`,
        message: `분류 후보 ${index + 1}번째의 상위 개념이 비어 있습니다`,
      });
    }
    if (candidate.isNewSub && candidate.sub === null) {
      issues.push({
        field: `candidates.${index}.sub`,
        message: `분류 후보 ${index + 1}번째가 신규 하위 개념인데 이름이 없습니다`,
      });
    }
  });

  if (issues.length > 0) return { ok: false, issues };

  const notes: string[] = [];
  const noEvidence = evidence.length === 0;
  if (noEvidence && summary !== "") {
    summary = "";
    notes.push("근거 발췌가 없어 요약을 비우고 저장합니다. 근거를 붙이면 요약도 함께 보낼 수 있습니다.");
  }

  const cardId = optionalText(input.cardId);
  const projectTopic = optionalText(input.projectTopic);

  return {
    ok: true,
    card: {
      ...(cardId ? { cardId } : {}),
      topicKey,
      title,
      summary,
      keywords,
      evidence,
      candidates,
      ...(projectTopic ? { projectTopic } : {}),
      noEvidence,
      estimates: noEvidence ? [] : findEstimates(summary),
      notes,
    },
  };
}
