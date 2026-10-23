# Trail

Claude와 나눈 대화에서 **기록하기로 한 결정**만 골라 개념 트리로 모아 보여 주는, 나 한 명만 쓰는 웹 앱입니다.

> 흩어진 대화창을 일일이 열어 보는 대신, 트리에서 원하는 기록을 1분 안에 찾는 것이 목표입니다.

## 무엇을 하나

- **Claude가 직접 기록합니다.** Claude에 이 앱을 커스텀 커넥터(원격 MCP 서버)로 연결하면, 대화 중 결정·결론이 나올 때 Claude가 카드(제목·요약·개념어·근거 발췌)를 앱으로 보냅니다. 기록 여부가 애매할 때만 대화당 1번 묻습니다.
- **자동으로 분류합니다.** 카드를 상위 개념 → 하위 개념 트리에 Claude API로 분류합니다. 새 하위 개념은 **내가 승인해야** 확정됩니다.
- **개념 트리와 그래프.** 접고 펼 수 있는 트리, 옵시디언 그래프 보기를 닮은 읽기 전용 그래프, 근거 발췌와 "추정" 표시.
- **승인·정리.** 하위 개념 승인/거절, 병합·분리 제안(버튼을 눌렀을 때만 Claude 호출), 카드 삭제.
- **내려받기.** Markdown / JSON.
- **과거 대화로 추천.** 대화 기록 파일(conversations.json)을 한 번 올리면 상위 개념·프로젝트 주제 후보를 추천받고, 승인한 것만 저장합니다. (파일 전체는 서버로 올라가지 않습니다.)
- **공개 샘플.** 로그인 전에는 지어낸 가상 카드 20장만 보이고, 내 데이터는 로그인(또는 커넥터 OAuth) 없이는 읽거나 쓸 수 없습니다.

## 화면

| 주소 | 설명 |
|---|---|
| `/` | 로그인 전 가상 샘플 화면 |
| `/login` | 이메일 로그인 (신규 가입은 막혀 있음) |
| `/my` | 개념 트리, 승인 대기, 정리 제안 |
| `/my/mindmap` | 그래프(읽기 전용) |
| `/my/import` | 과거 대화로 추천받기 |
| `/my/settings` | 무조건 제외할 주제 |
| `/oauth/consent` | Claude 커넥터 연결 승인 화면 |
| `/api/mcp` | Claude 전용 접수 창구(원격 MCP: `list_cards`, `record_cards`, `get_record_rules`) |

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript(strict) · Tailwind CSS 4 · Supabase(Postgres + Auth + OAuth 2.1 서버, RLS "내 행만") · Claude API(`claude-haiku-5-5`) · `mcp-handler` · zod · Vitest · Vercel

## 폴더

```
app/          화면과 API (app/api/mcp = 원격 MCP 서버)
components/   화면 조각 (트리, 그래프, 사이드 레일 등)
lib/rules/    순수 규칙: 카드 한도 검사, 비밀값 가리기, 트리·그래프 배치, 분류 결정 (+ 테스트)
lib/mcp/      카드 기록·조회, 호출 횟수·크기 제한, 토큰 확인
lib/claude/   Claude API 호출(분류·정리 제안·추천)과 지시문
supabase/     마이그레이션(SQL)과 스키마 점검
instructions/ Claude 사용자 지침(기록 규칙)
```

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값을 채운다 (아래 변수 이름 참고)
npm run dev
```

필요한 환경변수 이름만 적습니다(값은 `.env*`에 두고 저장소에는 올리지 않습니다).

| 이름 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 연결(공개용 값) |
| `ANTHROPIC_API_KEY` | 분류·정리 제안·추천 (서버 전용) |
| `OWNER_USER_ID` | 이 앱의 주인 계정 번호. 이 계정만 로그인·커넥터 승인 가능 |

## 검증

```bash
npm run lint && npm run build && npm test
npm run test:integration   # 실제 Supabase에 로그인해서 도는 시험(로그인 정보 필요)
```

## 문서

- [PRD.md](PRD.md) — 기획서(문제, 목표, 기능, 범위, 보안)
- [PLAN.md](PLAN.md) — 구현 계획과 진행 체크
- [DESIGN.md](DESIGN.md) — 설계(화면, 데이터 흐름, 도구, 보안, 시각 디자인)
- [CHECK.md](CHECK.md) — 설계 대비 구현·보안 점검 결과
- [CLAUDE.md](CLAUDE.md) — 이 프로젝트의 작업 규칙

## 보안 메모

- 키·토큰은 서버 환경변수에만 두고 브라우저로 보내지 않습니다. 서버 로그에는 대화·카드 내용을 남기지 않습니다.
- 모든 표에 RLS를 걸었고, 커넥터 요청은 20KB·분당 30회·하루 500회로 제한합니다.
- 카드·대화 속 문장은 Claude에게 "분석할 자료"로만 전달하고, 지시로 따르지 않게 막았습니다.
