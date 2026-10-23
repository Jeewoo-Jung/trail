-- 상향식 묶기 승인(PLAN 36): 새 상위 노드를 만들고 고른 노드들을 그 아래로 옮기는 일을 한 번에 처리한다(중간에 멈춰도 반쪽 적용이 남지 않는다).
-- 로그인한 사람 권한(security invoker)으로 실행되어 "내 행만" 규칙이 그대로 걸린다. 종류 규칙(어떤 노드 아래에 무엇을 둘 수 있나)은 앱이 먼저 검사하고, 여기서는 노드가 아직 같은 부모·종류로 살아 있는지만 다시 확인한다.
create function public.apply_group_proposal(p_id uuid, p_name text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  g public.group_proposals;
  zero constant uuid := '00000000-0000-0000-0000-000000000000';
  v_alive integer;
  v_parents integer;
  v_kinds integer;
  v_parent uuid;
  v_new uuid;
begin
  select * into g from public.group_proposals where id = p_id and status = 'proposed' for update;
  if not found then raise exception 'proposal_not_found'; end if;

  select count(*), count(distinct coalesce(parent_id, zero)), count(distinct kind), max(parent_id::text)::uuid
    into v_alive, v_parents, v_kinds, v_parent
    from public.nodes where id = any (g.child_node_ids) and deleted_at is null;
  if v_alive <> cardinality(g.child_node_ids) or v_parents <> 1 or v_kinds <> 1 then raise exception 'children_changed'; end if;

  insert into public.nodes (parent_id, kind, name, created_by)
    values (v_parent, g.suggested_kind, coalesce(nullif(btrim(p_name), ''), g.suggested_name), 'ai')
    returning id into v_new;
  update public.nodes set parent_id = v_new where id = any (g.child_node_ids);
  update public.group_proposals set status = 'approved', resolved_at = now() where id = p_id;
  return v_new;
end
$$;

revoke all on function public.apply_group_proposal(uuid, text) from public, anon;
grant execute on function public.apply_group_proposal(uuid, text) to authenticated;
