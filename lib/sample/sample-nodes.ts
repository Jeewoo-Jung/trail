// 로그인 전 화면에 보이는 가상 샘플. 모두 지어낸 내용이며 실제 기관·사람·대화가 아니다. 이 파일은 데이터베이스와 무관하다.
import { EMPTY_DATA, type EvidenceRow, type FieldRow, type NodeData, type NodeRow, type OutputRow, type SuggestionRow } from "../rules/node-tree";

let order = 0;
const node = (id: string, parentId: string | null, kind: NodeRow["kind"], name: string, over: Partial<NodeRow> = {}): NodeRow => ({
  id, parentId, kind, name, description: "", startDate: null, endDate: null, portfolioStatus: "candidate", lockedFields: [], resultState: "empty", resultSnoozeUntil: null, resultAskedAt: null, sortOrder: (order += 1), createdBy: "ai", deletedAt: null, updatedAt: "2026-09-30", ...over,
});
const field = (nodeId: string, f: FieldRow["field"], text: string, over: Partial<FieldRow> = {}): FieldRow => ({ nodeId, field: f, text, subject: "did", locked: false, updatedBy: "ai", updatedAt: "2026-09-30", ...over });
const ev = (id: string, nodeId: string, f: EvidenceRow["field"], excerpt: string, title: string, date: string): EvidenceRow => ({ id, nodeId, field: f, conversationTitle: title, conversationDate: date, excerpt });

const nodes: NodeRow[] = [
  node("s-cat", null, "category", "가상 포트폴리오", { createdBy: "user" }),
  node("s-p1", "s-cat", "project", "가상 데이터 공모전", { description: "지어낸 예시 프로젝트입니다.", startDate: "2026-08-01", endDate: "2026-09-20" }),
  node("s-a1", "s-p1", "activity", "검색 평가 세트 만들기", { startDate: "2026-08-05", endDate: "2026-08-20", lockedFields: ["name"], createdBy: "user" }),
  node("s-a2", "s-p1", "activity", "임베딩 모델 비교 실험", { startDate: "2026-08-21", endDate: "2026-09-05" }),
  node("s-a2a", "s-a2", "subactivity", "청크 길이 비교", { startDate: "2026-08-25", endDate: "2026-08-28" }),
  node("s-p2", "s-cat", "project", "가상 사이드 프로젝트", { startDate: "2026-06-01" }),
  node("s-a3", "s-p2", "activity", "일정 앱 화면 설계", { startDate: "2026-06-03", endDate: "2026-06-30" }),
  node("s-st", "s-cat", "study", "벡터 검색 개념 정리", { startDate: "2026-07-01" }),
  node("s-p3", null, "project", "보류 중인 가상 프로젝트", { portfolioStatus: "excluded" }),
  node("s-a4", "s-p3", "activity", "초기 아이디어 정리"),
];

const fields: FieldRow[] = [
  field("s-a1", "situation", "검색 품질을 숫자로 비교할 기준이 없어 모델을 바꿀 때마다 감으로 판단하고 있었다."),
  field("s-a1", "task", "정답 세트를 만들어 모델별 검색 결과를 같은 기준으로 비교할 수 있게 한다."),
  field("s-a1", "action", "문서에서 질문 20개를 직접 뽑고 각 질문의 정답 문단을 표시한 평가 세트를 만들었다.", { locked: true, updatedBy: "user" }),
  field("s-a1", "result_conversation", "상위 5개 안에 정답이 들어오는 비율로 비교하는 방식으로 정했다.", { subject: "plan" }),
  field("s-a2", "situation", "작은 모델과 큰 모델 중 어느 쪽이 이 문서 모음에 맞는지 알 수 없었다.", { subject: "estimate" }),
  field("s-a2", "action", "같은 평가 세트로 두 모델을 돌려 결과표를 만들 계획이다.", { subject: "plan" }),
  field("s-a3", "task", "한 화면에서 오늘 할 일과 이번 주 일정을 함께 보여 준다.", { subject: "claude_unconfirmed" }),
];
const evidence: EvidenceRow[] = [
  ev("e1", "s-a1", "action", "질문 20개면 충분히 감을 잡을 수 있다고 보고 직접 뽑았다.", "검색 평가 방법 정하기", "2026-08-12"),
  ev("e2", "s-a1", "situation", "모델을 바꿀 때마다 결과가 좋아졌는지 알 수가 없다.", "검색 평가 방법 정하기", "2026-08-12"),
  ev("e3", "s-a2", "action", "두 모델을 같은 평가 세트로 돌려서 표로 비교해 보자.", "모델 비교 계획", "2026-08-22"),
];
const outputs: OutputRow[] = [{ id: "o1", nodeId: "s-a1", name: "평가 세트(가상 예시)", url: null, storagePath: null, isFinal: true }];
const suggestions: SuggestionRow[] = [
  { id: "g1", nodeId: "s-a1", field: "action", text: "정답 문단을 두 사람이 따로 표시해 일치하는 것만 남겼다.", subject: "claude_unconfirmed", evidence: [{ conversationTitle: "평가 세트 점검", conversationDate: "2026-08-30", excerpt: "둘이 다르게 표시한 건 뺐다." }], createdAt: "2026-08-30" },
];

export const SAMPLE_NODE_DATA: NodeData = { ...EMPTY_DATA, nodes, fields, evidence, outputs, suggestions };
