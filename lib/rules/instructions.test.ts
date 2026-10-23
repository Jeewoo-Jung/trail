// 사용자 지침 문서의 숫자·이름이 코드의 한도·도구와 어긋나지 않게 지킨다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVITIES_PER_CALL_MAX } from "../mcp/record-activities";
import { EVIDENCE_LIMITS, REQUEST_LIMITS, STAR_LIMITS } from "./limits";
import { SUBJECTS } from "./nodes";

const text = readFileSync(new URL("../../instructions/trail-record-rules.md", import.meta.url), "utf8");
// 설명문 속에도 같은 표시가 나오므로 줄 처음에 있는 표시만 찾는다.
const body = text.slice(text.indexOf("\n=== 붙여 넣기 시작 ==="), text.indexOf("\n=== 붙여 넣기 끝 ==="));

describe("instructions/trail-record-rules.md", () => {
  it("STAR 항목별 글자 수·근거 한도·호출 한도가 코드와 같다", () => {
    expect(body).toContain(`**${STAR_LIMITS.situation}자 이하**`);
    expect(body).toContain(`**${STAR_LIMITS.task}자 이하**`);
    expect(body).toContain(`**${STAR_LIMITS.action}자 이하**`);
    expect(body).toContain(`**${STAR_LIMITS.result_conversation}자 이하**`);
    expect(body).toContain(`항목당 **최대 ${EVIDENCE_LIMITS.maxPerField}개**`);
    expect(body).toContain(`**${EVIDENCE_LIMITS.excerptMaxChars}자 이하**`);
    expect(body).toContain(`**최대 ${ACTIVITIES_PER_CALL_MAX}개**`);
    expect(body).toContain(`분당 ${REQUEST_LIMITS.perMinute}회, 하루 ${REQUEST_LIMITS.perDay}회`);
    expect(body).toContain(`${REQUEST_LIMITS.maxBytes / 1024}KB`);
  });
  it("기록 질문 규칙(메시지 5개·주제당 1회·대화당 3회·지식 질의 제외)을 담고 있다", () => {
    expect(body).toContain("내 메시지가 5개 이상");
    expect(body).toContain("주제당 1회, 한 대화에서 최대 3회");
    expect(body).toContain("지식 습득성 질의");
    expect(body).toContain("기록 여부와 위치를 함께");
    expect(body).toContain("이 활동에 이어붙이기");
  });
  it("주체 값 네 가지와 외부 결과 금지, 근거 없으면 비움을 적고 있다", () => {
    for (const subject of SUBJECTS) expect(body).toContain(`\`${subject}\``);
    expect(body).toContain("외부 결과");
    expect(body).toContain("근거(`evidence`)가 없으면 그 항목은 보내지 않는다");
  });
  it("결과 묻기 규칙(활동당 1회·주제 관련 대화만·지어내지 않기·300자)을 담고 있다", () => {
    expect(body).toContain("활동당 최대 1회");
    expect(body).toContain("주제가 그 활동·프로젝트와 관련 있을 때만");
    expect(body).toContain("내가 실제로 말한 것만");
    expect(body).toContain(`**${STAR_LIMITS.result_external}자 이하**`);
    for (const action of ["save", "not_applicable", "asked"]) expect(body).toContain(`\`${action}\``);
  });
  it("옛 방식(프로젝트 주제 자동 기록·항상 제외·분류 후보)을 더 이상 쓰지 않는다", () => {
    for (const old of ["projectTopics", "excludeTopics", "항상 제외", "candidates", "cardId", "미분류"]) expect(body).not.toContain(old);
  });
  it("실제 도구 이름과 입력 칸 이름을 쓰고 있다", () => {
    for (const name of ["list_cards", "record_cards", "record_result", "get_record_rules", "resultsPending", "askedBefore", "questionCount", "askedTopics", "topicKey", "nodeId", "parentId", "projectName", "대화 키"]) expect(body).toContain(name);
  });
});
