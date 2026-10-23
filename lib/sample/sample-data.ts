// Design Ref: DESIGN.md §4.4 — 로그인 전에 누구나 보는 가상 샘플 데이터. 코드 안에만 있고 데이터베이스·환경변수를 읽지 않는다.
// 모든 내용은 지어낸 것이다. 실제 기관·사람·대화와 무관하다.
import type { CardRow, ConceptRow } from "../rules/tree";

const c = (id: string, parentId: string | null, name: string, status: ConceptRow["status"] = "approved", sortOrder = 0): ConceptRow => ({ id, parentId, name, status, sortOrder });

// 개념은 부모-자식 트리다(뿌리 4개, 가장 깊은 곳은 3단계). 제안 중인 개념도 하나 넣어 승인 흐름이 보이게 한다.
export const SAMPLE_CONCEPTS: ConceptRow[] = [
  c("top-research", null, "연구", "approved", 0),
  c("embedding", "top-research", "임베딩"),
  c("small-model", "embedding", "소형 모델"),
  c("eval", "top-research", "평가 방법"),
  c("paper", "top-research", "논문 읽기", "proposed"),
  c("top-work", null, "업무", "approved", 1),
  c("meeting", "top-work", "회의 정리"),
  c("tools", "top-work", "도구 선택"),
  c("top-life", null, "생활", "approved", 2),
  c("budget", "top-life", "가계 관리"),
  c("health", "top-life", "운동 습관"),
  c("top-learn", null, "학습", "approved", 3),
  c("english", "top-learn", "영어 공부"),
  c("memo", "top-learn", "잡다한 메모", "rejected"),
];

type Seed = Omit<CardRow, "createdAt" | "candidates" | "conceptId"> & { day: number; concept: string | null };

const seeds: Seed[] = [
  { id: "c01", day: 1, title: "문장 임베딩 모델은 작은 모델로 시작", summary: "처음에는 작은 모델로 속도를 확인하고, 부족하면 큰 모델로 바꾸기로 했다.", keywords: ["임베딩", "모델 크기"], evidence: ["작은 모델로 먼저 돌려 보자", "속도가 부족하면 그때 키우자"], concept: "small-model", status: "done" },
  { id: "c02", day: 2, title: "검색 평가는 정답 20건으로", summary: "정답 20건을 직접 만들어 상위 5개 안에 들어오는 비율로 평가한다.", keywords: ["평가", "정답 세트"], evidence: ["정답 20건이면 충분히 감을 잡는다", "상위 5개 안에 들어오는지 본다"], concept: "eval", status: "done" },
  { id: "c03", day: 3, title: "청크 길이는 300자 안팎", summary: "문단을 300자 안팎으로 잘라야 검색 결과가 덜 흐려진다고 판단했다(추정).", keywords: ["청크", "검색"], evidence: ["길면 결과가 흐려진다"], concept: "embedding", status: "done" },
  { id: "c04", day: 4, title: "비교 실험은 한 번에 하나만 바꾼다", summary: "원인을 알 수 있도록 실험마다 바꾸는 값을 하나로 제한한다.", keywords: ["실험 설계"], evidence: ["한 번에 하나만 바꿔야 원인을 안다"], concept: "eval", status: "done" },
  { id: "c05", day: 5, title: "읽을 논문 목록 정리 방식", summary: "읽을 논문은 요약 3줄과 쓸모를 함께 적어 두기로 했다.", keywords: ["논문"], evidence: ["3줄 요약과 쓸모를 같이 적자"], concept: "paper", status: "done" },
  { id: "c06", day: 6, title: "주간 회의는 결정 사항만 남긴다", summary: "회의록은 길게 쓰지 않고 결정과 담당자만 남긴다.", keywords: ["회의", "결정"], evidence: ["결정과 담당자만 적는다"], concept: "meeting", status: "done" },
  { id: "c07", day: 7, title: "작업 관리 도구는 하나로 통일", summary: "도구가 여러 개면 놓치는 일이 생겨 하나로 모으기로 했다.", keywords: ["도구", "통일"], evidence: ["여러 군데 적으면 놓친다"], concept: "tools", status: "done" },
  { id: "c08", day: 8, title: "보고서 초안은 목차부터", summary: "내용을 쓰기 전에 목차를 먼저 합의하면 수정이 줄어든다(추정).", keywords: ["보고서", "목차"], evidence: ["목차부터 맞추자"], concept: "top-work", status: "done" },
  { id: "c09", day: 9, title: "메일 답장은 오전에 몰아서", summary: "메일은 오전 한 번 몰아서 답하는 편이 집중에 낫다.", keywords: ["메일", "집중"], evidence: ["오전에 한 번 몰아서 답하자"], concept: "tools", status: "done" },
  { id: "c10", day: 10, title: "가계부는 월 단위 합계만", summary: "매일 적는 것이 부담이라 월 단위 합계만 확인하기로 했다.", keywords: ["가계부"], evidence: ["월 합계만 봐도 충분하다"], concept: "budget", status: "done" },
  { id: "c11", day: 11, title: "구독 서비스 정리", summary: "쓰지 않는 구독 두 개를 해지하기로 했다.", keywords: ["구독", "정리"], evidence: ["두 달째 안 쓴 구독은 해지"], concept: "budget", status: "done" },
  { id: "c12", day: 12, title: "주 3회 걷기", summary: "무리하지 않게 주 3회, 30분 걷기를 목표로 했다.", keywords: ["운동", "걷기"], evidence: ["주 3회 30분이면 지킬 수 있다"], concept: "health", status: "done" },
  { id: "c13", day: 13, title: "수면 시간 고정", summary: "취침 시간을 고정하면 아침 컨디션이 나아진다고 보았다(추정).", keywords: ["수면"], evidence: [], concept: "health", status: "done" },
  { id: "c14", day: 14, title: "영어 단어는 문장으로 외우기", summary: "단어만 외우지 않고 예문과 함께 외우기로 했다.", keywords: ["영어", "단어"], evidence: ["예문과 같이 외우자"], concept: "english", status: "done" },
  { id: "c15", day: 15, title: "영어 말하기는 하루 5분 녹음", summary: "하루 5분 말하고 녹음해서 주말에 한 번 듣는다.", keywords: ["말하기", "녹음"], evidence: ["5분 녹음, 주말에 듣기"], concept: "english", status: "done" },
  { id: "c16", day: 16, title: "독서 메모는 한 줄 요약", summary: "책 한 권마다 한 줄 요약과 실천 하나만 적는다.", keywords: ["독서", "메모"], evidence: ["한 줄 요약과 실천 하나"], concept: "top-learn", status: "done" },
  { id: "c17", day: 17, title: "잡다한 아이디어 보관 위치", summary: "떠오른 아이디어는 한곳에 모아 두기로 했다.", keywords: ["아이디어"], evidence: ["한곳에 모으자"], concept: "memo", status: "done" },
  { id: "c18", day: 18, title: "어디에도 안 맞는 잡담 정리", summary: "특정 주제로 묶기 어려운 결정이라 미분류로 남았다.", keywords: ["기타"], evidence: ["딱히 분류하기 어렵다"], concept: null, status: "done" },
  { id: "c19", day: 19, title: "이번 주 기록 (분류 중)", summary: "", keywords: [], evidence: [], concept: null, status: "pending" },
  { id: "c20", day: 20, title: "한도 때문에 대기 중인 카드", summary: "분류를 미룬 카드는 나중에 다시 분류된다.", keywords: ["대기"], evidence: ["월 한도에 닿았다"], concept: null, status: "waiting" },
];

export const SAMPLE_CARDS: CardRow[] = seeds.map(({ day, concept, ...card }) => ({
  ...card,
  conceptId: concept,
  candidates: [],
  createdAt: `2026-09-${String(day).padStart(2, "0")}T03:00:00.000Z`,
}));
