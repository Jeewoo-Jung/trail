-- 결과 등록(PLAN 37): Claude가 채팅에서 활동의 결과를 이미 물었는지 기록한다(활동당 최대 1회). 결과 상태(result_state)·숨김(result_snooze_until)은 32번 표에 이미 있다.
alter table public.nodes add column result_asked_at timestamptz;
