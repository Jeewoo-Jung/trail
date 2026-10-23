-- 노드 편집(PLAN 34): 활동 합치기·쪼개기. 여러 표를 함께 옮겨야 해서 한 번에 처리하는 함수로 묶는다(중간에 멈춰도 반쪽 적용이 남지 않는다).
-- 둘 다 로그인한 사람 권한(security invoker)으로 실행되므로 "내 행만" 규칙이 그대로 걸린다.

-- 합치기: p_other의 항목·근거·산출물·제안·하위 세부활동을 p_keep으로 옮기고, p_other는 휴지통에 넣는다.
--  - 같은 항목이 둘 다 있으면 글을 이어 붙인다(항목별 글자 수 한도를 넘으면 'too_long:항목'으로 멈춘다 — 먼저 줄여야 한다). 잠금은 하나라도 잠겼으면 잠금.
--  - 근거는 항목당 3개까지만 옮기고, 산출물은 합쳐서 20개까지. 서로 조상·자손 관계이거나 종류가 다르면 합치지 않는다.
create function public.merge_activities(p_keep uuid, p_other uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  k public.nodes;
  o public.nodes;
  f record;
  e record;
  lim integer;
  combined text;
  room integer;
  cur uuid;
begin
  if p_keep = p_other then raise exception 'same_node'; end if;
  select * into k from public.nodes where id = p_keep and deleted_at is null;
  if not found then raise exception 'node_not_found'; end if;
  select * into o from public.nodes where id = p_other and deleted_at is null;
  if not found then raise exception 'node_not_found'; end if;
  if k.kind <> o.kind or k.kind not in ('activity', 'subactivity') then raise exception 'kind_mismatch'; end if;
  -- 조상·자손 관계 검사: 각각의 조상 줄을 거슬러 올라가 상대를 만나면 안 된다
  cur := o.parent_id;
  while cur is not null loop
    if cur = k.id then raise exception 'related_nodes'; end if;
    select parent_id into cur from public.nodes where id = cur;
  end loop;
  cur := k.parent_id;
  while cur is not null loop
    if cur = o.id then raise exception 'related_nodes'; end if;
    select parent_id into cur from public.nodes where id = cur;
  end loop;
  if (select count(*) from public.outputs where node_id in (p_keep, p_other)) > 20 then raise exception 'too_many_outputs'; end if;

  for f in select * from public.node_fields where node_id = p_other loop
    lim := case f.field when 'situation' then 300 when 'task' then 200 when 'action' then 500 else 300 end;
    if exists (select 1 from public.node_fields where node_id = p_keep and field = f.field) then
      select text || E'\n' || f.text into combined from public.node_fields where node_id = p_keep and field = f.field;
      if char_length(combined) > lim then raise exception 'too_long:%', f.field; end if;
      update public.node_fields set text = combined, locked = locked or f.locked, updated_at = now() where node_id = p_keep and field = f.field;
      delete from public.node_fields where node_id = p_other and field = f.field;
    else
      update public.node_fields set node_id = p_keep where node_id = p_other and field = f.field;
    end if;
    room := 3 - (select count(*) from public.evidence where node_id = p_keep and field = f.field);
    for e in select id from public.evidence where node_id = p_other and field = f.field order by created_at loop
      exit when room <= 0;
      update public.evidence set node_id = p_keep where id = e.id;
      room := room - 1;
    end loop;
  end loop;

  update public.outputs set node_id = p_keep where node_id = p_other;
  update public.field_suggestions set node_id = p_keep where node_id = p_other and status = 'proposed';
  update public.nodes set parent_id = p_keep where parent_id = p_other and deleted_at is null;
  update public.nodes set
    start_date = case when k.start_date is null then o.start_date when o.start_date is null then k.start_date else least(k.start_date, o.start_date) end,
    end_date = case when k.end_date is null then o.end_date when o.end_date is null then k.end_date else greatest(k.end_date, o.end_date) end
    where id = p_keep;
  update public.nodes set deleted_at = now() where id = p_other;
end
$$;

-- 쪼개기: p_id 활동에서 고른 항목(p_fields)과 세부활동(p_children)을 같은 부모 아래의 새 활동으로 옮긴다. 새 활동의 id를 돌려준다.
create function public.split_activity(p_id uuid, p_name text, p_fields text[], p_children uuid[]) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  n public.nodes;
  v_new uuid;
begin
  select * into n from public.nodes where id = p_id and deleted_at is null and kind in ('activity', 'subactivity');
  if not found then raise exception 'node_not_found'; end if;
  if coalesce(array_length(p_fields, 1), 0) = 0 and coalesce(array_length(p_children, 1), 0) = 0 then raise exception 'nothing_to_move'; end if;
  insert into public.nodes (parent_id, kind, name, start_date, end_date, created_by)
    values (n.parent_id, n.kind, p_name, n.start_date, n.end_date, 'user') returning id into v_new;
  update public.node_fields set node_id = v_new where node_id = p_id and field = any (p_fields);
  update public.evidence set node_id = v_new where node_id = p_id and field = any (p_fields);
  update public.nodes set parent_id = v_new where parent_id = p_id and id = any (p_children) and deleted_at is null;
  return v_new;
end
$$;

revoke all on function public.merge_activities(uuid, uuid), public.split_activity(uuid, text, text[], uuid[]) from public, anon;
grant execute on function public.merge_activities(uuid, uuid), public.split_activity(uuid, text, text[], uuid[]) to authenticated;
