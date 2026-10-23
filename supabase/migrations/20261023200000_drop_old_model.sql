-- 옛 개념 트리·카드 모델 정리(PLAN 34). 코드가 새 노드 모델(nodes 등)만 쓰게 된 뒤, 배포 직후에 적용한다.
-- (배포된 옛 앱이 이 표를 읽는 동안에는 적용하지 않는다.) 초기화로 이 표들의 데이터는 이미 비어 있고, 백업은 로컬 backups/에 있다.

drop function if exists public.approve_concept(uuid);
drop function if exists public.reject_concept(uuid);
drop function if exists public.apply_tree_merge(uuid);
drop function if exists public.apply_tree_split(uuid);
drop function if exists public.remove_concept(uuid, boolean); -- concept-edit 시도에서 적용했던 함수(있으면)
drop function if exists public.move_card(uuid, uuid);

drop table if exists public.tree_proposals;
drop table if exists public.cards cascade;
drop table if exists public.concepts cascade;
drop table if exists public.sub_concepts cascade;
drop table if exists public.top_concepts cascade;

drop function if exists public.bump_conversation_card_count();
drop function if exists public.card_evidence_ok(jsonb);
drop function if exists public.json_array_at_most(jsonb, integer);
drop function if exists public.concepts_set_depth();

-- 설정: 무조건 제외 목록과 옛 프로젝트 주제 자동 기록 목록은 만들지 않는다(새 기록 질문 방식으로 일원화). 결과 등록 일수만 남는다.
alter table public.settings drop column if exists always_excluded, drop column if exists blocked, drop column if exists project_topics;
alter table public.conversations drop column if exists card_count;
