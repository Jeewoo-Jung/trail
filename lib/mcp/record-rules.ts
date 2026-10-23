// Design Ref: DESIGN.md §6.4 — Claude가 "최신 기록 규칙"을 앱에서 직접 읽어 가게 한다. 규칙의 원본은 instructions/trail-record-rules.md 한 곳이다.
import { readFile } from "node:fs/promises";
import path from "node:path";

const START = "\n=== 붙여 넣기 시작 ===";
const END = "\n=== 붙여 넣기 끝 ===";

/** 문서에서 Claude에게 줄 구간(붙여 넣기 시작~끝)만 꺼낸다. 표시가 없으면 null. */
export function extractRules(markdown: string): string | null {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start === -1 || end === -1 || end <= start) return null;
  const body = markdown.slice(start + START.length, end).trim();
  return body === "" ? null : body;
}

export const RULES_NOTE = "※ 프로젝트 주제 목록은 이 도구가 아니라 사용자 지침에 적힌 목록을 따릅니다.";

export async function loadRecordRules(): Promise<string | null> {
  const file = path.join(process.cwd(), "instructions", "trail-record-rules.md");
  const rules = extractRules(await readFile(file, "utf8"));
  return rules === null ? null : `${rules}\n\n${RULES_NOTE}`;
}
