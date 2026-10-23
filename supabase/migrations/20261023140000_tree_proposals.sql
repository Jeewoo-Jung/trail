-- 트리 정리 제안(PLAN 23): AI가 병합·분리를 먼저 제안하고, 내가 승인해야 적용한다.
-- 제안은 내가 "정리 제안 받기"를 눌렀을 때만 만들어지고, 같은 제안(signature)은 거절한 뒤에도 다시 만들지 않는다.

create table public.tree_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('merge', 'split')),
  top_concept_id uuid not null references public.top_concepts (id) on delete cascade,
  -- 같은 제안인지 알아보는 글자. 병합은 두 하위 개념 id, 분리는 나눌 하위 개념 id로 만든다.
  signature text not null check (btrim(signature) <> ''),
  -- 병합: {fromId, intoId, fromName, intoName} / 분리: {subId, subName, parts: [{name, cardIds}]}
  payload jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, signature)
);

alter table public.tree_proposals enable row level security;

create policy tree_proposals_own on public.tree_proposals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.tree_proposals from anon, authenticated;
grant select, insert, update, delete on table public.tree_proposals to authenticated;

-- 병합 승인: from 하위 개념의 카드를 into로 옮기고 from을 지운다. 한 번에 모두 되거나 모두 안 된다.
-- security invoker라서 로그인한 사람의 권한(RLS)으로 실행된다.
create or replace function public.apply_tree_merge(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  p public.tree_proposals;
  v_from uuid;
  v_into uuid;
begin
  select * into p from public.tree_proposals where id = p_id and kind = 'merge' and status = 'proposed' for update;
  if not found then raise exception 'proposal_not_found'; end if;
  v_from := (p.payload ->> 'fromId')::uuid;
  v_into := (p.payload ->> 'intoId')::uuid;
  if v_from = v_into then raise exception 'same_sub'; end if;
  perform 1 from public.sub_concepts where id = v_from and top_concept_id = p.top_concept_id and status = 'approved';
  if not found then raise exception 'from_missing'; end if;
  perform 1 from public.sub_concepts where id = v_into and top_concept_id = p.top_concept_id and status = 'approved';
  if not found then raise exception 'into_missing'; end if;

  update public.cards set sub_concept_id = v_into where sub_concept_id = v_from;
  delete from public.sub_concepts where id = v_from;
  update public.tree_proposals set status = 'approved', resolved_at = now() where id = p_id;
end
$$;

-- 분리 승인: 새 하위 개념(승인된 상태)을 만들고, 제안에 적힌 카드만 그쪽으로 옮긴다. 원래 하위 개념과 나머지 카드는 그대로 둔다.
create or replace function public.apply_tree_split(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  p public.tree_proposals;
  v_sub uuid;
  v_part jsonb;
  v_new uuid;
begin
  select * into p from public.tree_proposals where id = p_id and kind = 'split' and status = 'proposed' for update;
  if not found then raise exception 'proposal_not_found'; end if;
  v_sub := (p.payload ->> 'subId')::uuid;
  perform 1 from public.sub_concepts where id = v_sub and top_concept_id = p.top_concept_id and status = 'approved';
  if not found then raise exception 'sub_missing'; end if;

  for v_part in select * from jsonb_array_elements(p.payload -> 'parts') loop
    insert into public.sub_concepts (top_concept_id, name, status)
      values (p.top_concept_id, v_part ->> 'name', 'approved')
      returning id into v_new;
    update public.cards set sub_concept_id = v_new
      where sub_concept_id = v_sub
        and id in (select (x)::uuid from jsonb_array_elements_text(v_part -> 'cardIds') as x);
  end loop;
  update public.tree_proposals set status = 'approved', resolved_at = now() where id = p_id;
end
$$;

revoke all on function public.apply_tree_merge(uuid), public.apply_tree_split(uuid) from public, anon;
grant execute on function public.apply_tree_merge(uuid), public.apply_tree_split(uuid) to authenticated;
