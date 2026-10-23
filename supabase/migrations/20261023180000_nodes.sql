-- 노드·활동 카드 모델(PLAN 32, DESIGN §14). 새 표만 더하는 마이그레이션이다(기존 concepts·cards 등은 그대로 두고, 그것을 쓰는 코드가 바뀌는 33·34번에서 정리한다).
--  - nodes: 범주·프로젝트·활동·세부활동·학습을 한 표에(부모 연결). 삭제는 휴지통(deleted_at), 제외는 포트폴리오 상태, 사용자가 고친 필드는 locked_fields에 기록.
--  - node_fields: 활동의 STAR 항목(값·주체·잠금). 값이 없으면 행을 만들지 않는다(미입력).
--  - evidence: 항목별 근거(대화 제목·날짜 + 원문 발췌). outputs: 산출물 목록. field_suggestions: 잠긴 항목 등에 대한 새 내용 제안.
--  - group_proposals: 상향식 묶기 제안. topic_questions: 주제당 1회 질문 기록.
-- 숫자 한도는 lib/rules/limits.ts와 같다(코드가 먼저 검사하고, 여기는 안전망이다).

create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid,
  kind text not null check (kind in ('category', 'project', 'activity', 'subactivity', 'study')),
  name text not null check (btrim(name) <> '' and char_length(name) <= 60),
  description text not null default '' check (char_length(description) <= 500),
  start_date date,
  end_date date,
  portfolio_status text not null default 'candidate' check (portfolio_status in ('candidate', 'needs_work', 'hold', 'excluded')),
  locked_fields text[] not null default '{}' check (locked_fields <@ array['name', 'kind', 'parent', 'period', 'description', 'portfolio_status']::text[]),
  result_state text not null default 'empty' check (result_state in ('empty', 'snoozed', 'not_applicable', 'filled')),
  result_snooze_until timestamptz,
  sort_order integer not null default 0,
  created_by text not null default 'user' check (created_by in ('ai', 'user')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- 부모는 같은 사용자의 노드여야 한다(부모 연결이 사라지면 아래 가지도 함께 지워진다)
  foreign key (parent_id, user_id) references public.nodes (id, user_id) on delete cascade,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index nodes_parent_idx on public.nodes (parent_id);
create index nodes_user_deleted_idx on public.nodes (user_id, deleted_at);

-- 순환과 너무 깊은 단계를 막고, 노드 개수 한도를 지키며, 고친 시각을 갱신한다.
create function public.nodes_guard() returns trigger language plpgsql set search_path = public as $$
declare
  cur uuid := new.parent_id;
  d integer := 1;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.nodes) >= 1000 then raise exception 'node_limit'; end if;
  else
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
create trigger nodes_guard_ins before insert on public.nodes for each row execute function public.nodes_guard();
create trigger nodes_guard_upd before update on public.nodes for each row execute function public.nodes_guard();

-- STAR 항목. 항목별 글자 수 한도는 코드와 같다(상황 300, 과제 200, 내가 한 일 500, 결과 300, 외부 결과 300).
create table public.node_fields (
  node_id uuid not null,
  field text not null check (field in ('situation', 'task', 'action', 'result_conversation', 'result_external')),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (btrim(text) <> ''),
  subject text not null check (subject in ('did', 'plan', 'claude_unconfirmed', 'estimate')),
  locked boolean not null default false,
  updated_by text not null default 'user' check (updated_by in ('ai', 'user')),
  updated_at timestamptz not null default now(),
  primary key (node_id, field),
  foreign key (node_id, user_id) references public.nodes (id, user_id) on delete cascade,
  check (char_length(text) <= case field when 'situation' then 300 when 'task' then 200 when 'action' then 500 else 300 end)
);

-- 항목별 근거. 항목당 3개까지.
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  node_id uuid not null,
  field text not null check (field in ('situation', 'task', 'action', 'result_conversation', 'result_external')),
  conversation_title text not null check (btrim(conversation_title) <> '' and char_length(conversation_title) <= 100),
  conversation_date date not null,
  excerpt text not null check (btrim(excerpt) <> '' and char_length(excerpt) <= 300),
  created_at timestamptz not null default now(),
  foreign key (node_id, user_id) references public.nodes (id, user_id) on delete cascade
);
create index evidence_node_idx on public.evidence (node_id, field);
create function public.evidence_limit() returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.evidence where node_id = new.node_id and field = new.field) >= 3 then raise exception 'evidence_limit'; end if;
  return new;
end
$$;
create trigger evidence_limit_ins before insert on public.evidence for each row execute function public.evidence_limit();

-- 산출물 목록(최종 산출물 포함). 첨부 파일은 Storage 경로만 적는다(파일 업로드는 37번).
create table public.outputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  node_id uuid not null,
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  url text check (url is null or char_length(url) <= 500),
  storage_path text check (storage_path is null or char_length(storage_path) <= 300),
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (node_id, user_id) references public.nodes (id, user_id) on delete cascade
);
create index outputs_node_idx on public.outputs (node_id);

-- 기존 활동에 새 기록이 들어왔을 때 잠긴 항목 등에 대한 필드별 제안
create table public.field_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  node_id uuid not null,
  field text not null check (field in ('situation', 'task', 'action', 'result_conversation', 'result_external')),
  text text not null check (btrim(text) <> '' and char_length(text) <= 500),
  subject text not null check (subject in ('did', 'plan', 'claude_unconfirmed', 'estimate')),
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected')),
  source_conversation_key uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (node_id, user_id) references public.nodes (id, user_id) on delete cascade
);
create index field_suggestions_node_idx on public.field_suggestions (node_id, status);

-- 상향식 묶기 제안. signature(같은 제안인지 알아보는 글자)로 거절한 제안을 다시 만들지 않는다.
create table public.group_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  child_node_ids uuid[] not null check (cardinality(child_node_ids) >= 2),
  suggested_name text not null check (btrim(suggested_name) <> '' and char_length(suggested_name) <= 60),
  suggested_kind text not null check (suggested_kind in ('category', 'project', 'activity')),
  signature text not null check (btrim(signature) <> ''),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, signature)
);

-- 주제당 1회 질문 기록(대화당 최대 3회는 conversations.question_count로 센다)
create table public.topic_questions (
  conversation_key uuid not null references public.conversations (key) on delete cascade,
  topic_key text not null check (btrim(topic_key) <> '' and char_length(topic_key) <= 100),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asked_at timestamptz not null default now(),
  primary key (conversation_key, topic_key)
);

-- 대화당 질문은 최대 3회. 설정에는 결과 등록 대기(7일)와 "나중에" 숨김 기간을 둔다.
alter table public.conversations add constraint conversations_question_max check (question_count between 0 and 3);
alter table public.settings
  add column result_wait_days integer not null default 7 check (result_wait_days between 1 and 365),
  add column result_snooze_days integer not null default 3 check (result_snooze_days between 1 and 90);

-- 휴지통: 노드와 아래 가지를 한 시각으로 함께 넣고, 복구는 같은 시각의 것만 되돌린다. 부모가 아직 휴지통에 있으면 복구하지 못한다.
create function public.trash_node(p_id uuid) returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  perform 1 from public.nodes where id = p_id and deleted_at is null;
  if not found then raise exception 'node_not_found'; end if;
  with recursive sub as (
    select id from public.nodes where id = p_id
    union all
    select c.id from public.nodes c join sub s on c.parent_id = s.id
  )
  update public.nodes set deleted_at = now() where id in (select id from sub) and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end
$$;

create function public.restore_node(p_id uuid) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  t timestamptz;
  par uuid;
  n integer;
begin
  select deleted_at, parent_id into t, par from public.nodes where id = p_id and deleted_at is not null;
  if not found then raise exception 'node_not_found'; end if;
  if par is not null then
    perform 1 from public.nodes where id = par and deleted_at is not null;
    if found then raise exception 'parent_trashed'; end if;
  end if;
  with recursive sub as (
    select id from public.nodes where id = p_id
    union all
    select c.id from public.nodes c join sub s on c.parent_id = s.id
  )
  update public.nodes set deleted_at = null where id in (select id from sub) and deleted_at = t;
  get diagnostics n = row_count;
  return n;
end
$$;

-- 권한: 로그인한 나만, 내 행만
alter table public.nodes enable row level security;
alter table public.node_fields enable row level security;
alter table public.evidence enable row level security;
alter table public.outputs enable row level security;
alter table public.field_suggestions enable row level security;
alter table public.group_proposals enable row level security;
alter table public.topic_questions enable row level security;

create policy nodes_own on public.nodes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy node_fields_own on public.node_fields for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy evidence_own on public.evidence for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy outputs_own on public.outputs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy field_suggestions_own on public.field_suggestions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy group_proposals_own on public.group_proposals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy topic_questions_own on public.topic_questions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table public.nodes, public.node_fields, public.evidence, public.outputs, public.field_suggestions, public.group_proposals, public.topic_questions from anon, authenticated;
grant select, insert, update, delete on table public.nodes, public.node_fields, public.evidence, public.outputs, public.field_suggestions, public.group_proposals, public.topic_questions to authenticated;
revoke all on function public.trash_node(uuid), public.restore_node(uuid) from public, anon;
grant execute on function public.trash_node(uuid), public.restore_node(uuid) to authenticated;

-- 실시간 갱신: 노드·항목·제안의 변경을 화면이 받는다
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.nodes, public.node_fields, public.field_suggestions, public.outputs;
  end if;
end
$$;
