-- PLAN 21: 과거 대화 분석으로 추천받은 상위 개념·프로젝트 주제를 내가 승인하면 앱이 저장한다.
-- 1) 상위 개념: 지금까지는 앱이 읽기만 했다. 승인한 후보를 저장할 수 있게 "내 행 추가"만 연다(수정·삭제는 여전히 Supabase 화면에서만 한다).
-- 2) 프로젝트 주제 목록: 사용자 지침에 붙여 넣던 목록을 앱 설정에 저장하고, 기록 전에 부르는 list_cards가 돌려준다.

create policy top_concepts_insert_own on public.top_concepts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant insert on table public.top_concepts to authenticated;

alter table public.settings
  add column project_topics text[] not null default '{}'
  check (cardinality(project_topics) <= 50);
