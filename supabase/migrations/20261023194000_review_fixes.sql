-- 배포 전 점검에서 찾은 문제 두 가지를 고친다(PLAN 37·34 보완).
-- 1) 내가 비운 항목: 항목을 지우면 행도 지워져서 잠금이 사라지고 다음 기록이 다시 채워 버렸다. 비운 항목 이름을 cleared_fields에 남겨,
--    AI 기록은 그 항목에 값을 넣지 않고 제안으로만 쌓게 한다(내가 다시 쓰면 목록에서 빠진다).
alter table public.nodes
  add column cleared_fields text[] not null default '{}'
  check (cleared_fields <@ array['situation', 'task', 'action', 'result_conversation', 'result_external']::text[]);

-- 2) "마지막 기록" 시각(updated_at): "나중에"·"해당 없음"·"물었다" 표시처럼 결과 상태만 바뀌는 수정은 기록이 아니므로 시각을 갱신하지 않는다.
--    (갱신하면 결과 등록 대기의 7일 기준이 다시 시작되어, 나중에를 누르면 3일이 아니라 7일 넘게 숨겨졌다.)
create or replace function public.nodes_guard() returns trigger language plpgsql set search_path = public as $$
declare
  cur uuid := new.parent_id;
  d integer := 1;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.nodes) >= 1000 then raise exception 'node_limit'; end if;
  elsif (to_jsonb(new) - 'updated_at' - 'result_state' - 'result_snooze_until' - 'result_asked_at')
        is distinct from (to_jsonb(old) - 'updated_at' - 'result_state' - 'result_snooze_until' - 'result_asked_at') then
    new.updated_at := now();
  end if;
  while cur is not null loop
    if cur = new.id then raise exception 'node_cycle'; end if;
    d := d + 1;
    if d > 8 then raise exception 'node_too_deep'; end if;
    select parent_id into cur from public.nodes where id = cur;
  end loop;
  return new;
end
$$;
