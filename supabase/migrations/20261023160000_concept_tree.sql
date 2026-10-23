-- 개념 트리: 상위·하위 두 단계로 고정돼 있던 개념(top_concepts·sub_concepts)을 부모-자식으로 이어지는 한 표(concepts)로 합친다.
--  - 단계 수는 5단계까지(트리거가 depth를 채우고 check로 막는다). 같은 부모 아래에서는 이름이 겹치지 않는다(거절한 이름은 행으로 남아 다시 제안되지 않는다).
--  - 상위 개념도 Claude가 새로 만들어 "제안(proposed)"으로 올릴 수 있고, 내가 승인해야 확정된다. 승인·거절은 가지째(그 아래 제안까지) 처리한다.
--  - 기존 데이터는 id를 그대로 옮긴다: 상위 개념 → 뿌리, 하위 개념 → 그 아래 자식. 카드는 있던 가장 깊은 개념에 붙는다.

create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.concepts (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 60),
  status text not null default 'approved' check (status in ('proposed', 'approved', 'rejected')),
  sort_order integer not null default 0,
  depth integer not null default 1 check (depth between 1 and 5),
  created_at timestamptz not null default now()
);

create unique index concepts_sibling_name on public.concepts (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
create index concepts_parent_idx on public.concepts (parent_id);

-- 단계(depth)는 부모의 단계 + 1. 부모는 같은 사용자의 것이어야 한다(로그인한 사람 권한으로 실행되므로 남의 행은 아예 보이지 않는다).
create function public.concepts_set_depth() returns trigger language plpgsql set search_path = public as $$
declare p public.concepts;
begin
  if new.parent_id is null then
    new.depth := 1;
  else
    select * into p from public.concepts where id = new.parent_id;
    if not found or p.user_id <> new.user_id then raise exception 'parent_not_found'; end if;
    new.depth := p.depth + 1;
  end if;
  return new;
end
$$;
create trigger concepts_depth before insert on public.concepts for each row execute function public.concepts_set_depth();

-- 기존 데이터 옮기기 (id 그대로)
insert into public.concepts (id, user_id, parent_id, name, status, sort_order, created_at)
  select id, user_id, null, name, 'approved', sort_order, created_at from public.top_concepts;
insert into public.concepts (id, user_id, parent_id, name, status, sort_order, created_at)
  select id, user_id, top_concept_id, name, status, 0, created_at from public.sub_concepts;

alter table public.cards add column concept_id uuid references public.concepts (id) on delete set null;
update public.cards set concept_id = coalesce(sub_concept_id, top_concept_id);
alter table public.cards drop column top_concept_id, drop column sub_concept_id;
create index cards_concept_idx on public.cards (concept_id);

-- 정리 제안: 대상이 "같은 부모 아래 형제"가 되도록 부모 칸으로 바꾼다.
alter table public.tree_proposals add column parent_concept_id uuid references public.concepts (id) on delete cascade;
update public.tree_proposals set parent_concept_id = top_concept_id;
alter table public.tree_proposals drop column top_concept_id;

-- 접근 규칙: 내 행만
alter table public.concepts enable row level security;
create policy concepts_own on public.concepts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on table public.concepts from anon, authenticated;
grant select, insert, update, delete on table public.concepts to authenticated;

-- 실시간 갱신: 개념의 변경도 화면이 받는다(옛 표를 지우면 알아서 빠진다)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.concepts;
  end if;
end
$$;

drop table public.sub_concepts;
drop table public.top_concepts;

-- 가지째 승인: 그 개념과 그 아래 제안 중인 개념을 모두 승인한다. 부모가 아직 승인되지 않았으면 거절한다.
create or replace function public.approve_concept(p_id uuid) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_parent uuid;
  v_parent_status text;
  n integer;
begin
  select parent_id into v_parent from public.concepts where id = p_id and status = 'proposed';
  if not found then return 0; end if;
  if v_parent is not null then
    select status into v_parent_status from public.concepts where id = v_parent;
    if v_parent_status is distinct from 'approved' then raise exception 'parent_not_approved'; end if;
  end if;
  with recursive sub as (
    select id from public.concepts where id = p_id
    union all
    select c.id from public.concepts c join sub s on c.parent_id = s.id where c.status = 'proposed'
  )
  update public.concepts set status = 'approved' where id in (select id from sub) and status = 'proposed';
  get diagnostics n = row_count;
  return n;
end
$$;

-- 가지째 거절: 그 개념과 그 아래 모든 개념을 거절 상태로 두고(이름이 다시 제안되지 않게 행은 남긴다), 붙어 있던 카드는 부모 개념으로 옮긴다(뿌리면 미분류).
create or replace function public.reject_concept(p_id uuid) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_parent uuid;
  n integer;
begin
  select parent_id into v_parent from public.concepts where id = p_id and status = 'proposed';
  if not found then return 0; end if;
  create temporary table if not exists _reject_ids (id uuid) on commit drop;
  truncate _reject_ids;
  with recursive sub as (
    select id from public.concepts where id = p_id
    union all
    select c.id from public.concepts c join sub s on c.parent_id = s.id
  )
  insert into _reject_ids select id from sub;
  update public.cards set concept_id = v_parent where concept_id in (select id from _reject_ids);
  update public.concepts set status = 'rejected' where id in (select id from _reject_ids);
  get diagnostics n = row_count;
  return n;
end
$$;

-- 병합 승인: 같은 부모 아래의 잎(자식 없는) 개념 둘. from의 카드를 into로 옮기고 from을 지운다.
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
  perform 1 from public.concepts where id = v_from and status = 'approved' and parent_id is not distinct from p.parent_concept_id
    and not exists (select 1 from public.concepts k where k.parent_id = v_from);
  if not found then raise exception 'from_missing'; end if;
  perform 1 from public.concepts where id = v_into and status = 'approved' and parent_id is not distinct from p.parent_concept_id;
  if not found then raise exception 'into_missing'; end if;

  update public.cards set concept_id = v_into where concept_id = v_from;
  delete from public.concepts where id = v_from;
  update public.tree_proposals set status = 'approved', resolved_at = now() where id = p_id;
end
$$;

-- 분리 승인: 그 개념 "아래에" 세부 개념(승인된 상태)을 만들고, 제안에 적힌 카드만 그쪽으로 옮긴다. 나머지 카드는 그대로 둔다.
create or replace function public.apply_tree_split(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  p public.tree_proposals;
  v_node uuid;
  v_part jsonb;
  v_new uuid;
begin
  select * into p from public.tree_proposals where id = p_id and kind = 'split' and status = 'proposed' for update;
  if not found then raise exception 'proposal_not_found'; end if;
  v_node := (p.payload ->> 'subId')::uuid;
  perform 1 from public.concepts where id = v_node and status = 'approved' and parent_id is not distinct from p.parent_concept_id;
  if not found then raise exception 'sub_missing'; end if;

  for v_part in select * from jsonb_array_elements(p.payload -> 'parts') loop
    insert into public.concepts (parent_id, name, status)
      values (v_node, v_part ->> 'name', 'approved')
      returning id into v_new;
    update public.cards set concept_id = v_new
      where concept_id = v_node
        and id in (select (x)::uuid from jsonb_array_elements_text(v_part -> 'cardIds') as x);
  end loop;
  update public.tree_proposals set status = 'approved', resolved_at = now() where id = p_id;
end
$$;

revoke all on function public.approve_concept(uuid), public.reject_concept(uuid), public.apply_tree_merge(uuid), public.apply_tree_split(uuid) from public, anon;
grant execute on function public.approve_concept(uuid), public.reject_concept(uuid), public.apply_tree_merge(uuid), public.apply_tree_split(uuid) to authenticated;
