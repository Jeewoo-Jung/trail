-- Trail 데이터 구조 (DESIGN.md 5번, PLAN 5번)
-- 모든 표에 user_id를 두고 RLS("내 행만")를 건다. 한도 숫자는 앱의 lib/rules/limits.ts와 같다.
-- 앱이 먼저 검사하지만, 앱이 놓쳐도 데이터베이스가 한 번 더 막도록 같은 한도를 걸어 둔다.

-- ───────────────────────────────────────────────
-- 도우미 함수
-- ───────────────────────────────────────────────

-- 배열이 맞는지, 길이가 한도 이하인지 본다. (배열이 아니면 거짓)
create function public.json_array_at_most(value jsonb, max_items integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) = 'array' then jsonb_array_length(value) <= max_items
    else false
  end
$$;

-- 근거 발췌: 배열이고, 3개 이하이며, 각각 300자 이하
create function public.card_evidence_ok(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) = 'array' then
      jsonb_array_length(value) <= 3
      and not exists (
        select 1 from jsonb_array_elements_text(value) as e(item)
        where char_length(e.item) > 300
      )
    else false
  end
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- 카드가 생기고 지워질 때 대화의 카드 수를 맞춘다. 10장을 넘으면 conversations의 검사가 막는다.
create function public.bump_conversation_card_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.conversations set card_count = card_count + 1 where key = new.conversation_key;
  elsif tg_op = 'DELETE' then
    update public.conversations set card_count = card_count - 1 where key = old.conversation_key;
  end if;
  return null;
end
$$;

-- ───────────────────────────────────────────────
-- 표
-- ───────────────────────────────────────────────

-- 상위 개념(5~10개). 앱 화면에서는 읽기만 한다. 바꿀 때는 Supabase 화면에서 직접 고친다.
create table public.top_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- 하위 개념과 제안. 같은 상위 개념 아래에서는 이름이 겹치지 않으므로, 거절된 이름은 다시 제안되지 않는다.
create table public.sub_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  top_concept_id uuid not null references public.top_concepts (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (top_concept_id, name)
);

-- 대화 단위 묶음. 대화 키는 앱이 처음 기록할 때 발급한다.
create table public.conversations (
  key uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_count integer not null default 0 check (card_count between 0 and 10),
  question_count integer not null default 0 check (question_count >= 0),
  created_at timestamptz not null default now()
);

-- 카드. 같은 대화의 같은 주제(대화 키 + 주제 키)는 카드 하나다.
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_key uuid not null references public.conversations (key) on delete cascade,
  topic_key text not null check (btrim(topic_key) <> ''),
  title text not null check (btrim(title) <> ''),
  summary text not null default '' check (char_length(summary) <= 500),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 7),
  evidence jsonb not null default '[]'::jsonb check (public.card_evidence_ok(evidence)),
  candidates jsonb not null default '[]'::jsonb check (public.json_array_at_most(candidates, 3)),
  project_topic text,
  top_concept_id uuid references public.top_concepts (id) on delete set null,
  sub_concept_id uuid references public.sub_concepts (id) on delete set null,
  -- pending=분류 중, done=끝남, waiting=미분류(대기)
  classification_status text not null default 'pending'
    check (classification_status in ('pending', 'done', 'waiting')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_key, topic_key)
);

-- 제외 목록 두 가지. always_excluded는 질문에 "이 주제는 항상 제외"로 답하면 쌓이고,
-- blocked는 내가 설정 화면에서 직접 적는 무조건 제외다(처음에는 비어 있다).
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  always_excluded text[] not null default '{}',
  blocked text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- 호출 횟수 세기. 분 단위·하루 단위(한국 시간 자정 기준)로 센다.
create table public.api_calls (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('minute', 'day')),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, kind, window_start)
);

-- ───────────────────────────────────────────────
-- 트리거와 색인
-- ───────────────────────────────────────────────

create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

create trigger cards_count_on_insert
  after insert on public.cards
  for each row execute function public.bump_conversation_card_count();

create trigger cards_count_on_delete
  after delete on public.cards
  for each row execute function public.bump_conversation_card_count();

create index sub_concepts_top_idx on public.sub_concepts (top_concept_id);
create index cards_user_top_idx on public.cards (user_id, top_concept_id);
create index cards_user_created_idx on public.cards (user_id, created_at desc);
create index cards_conversation_idx on public.cards (conversation_key);
create index cards_sub_idx on public.cards (sub_concept_id);
-- 분류가 끝나지 않은 카드를 오래된 것부터 다시 분류할 때 쓴다(DESIGN 4.5)
create index cards_unfinished_idx on public.cards (user_id, created_at) where classification_status <> 'done';

-- ───────────────────────────────────────────────
-- 접근 규칙(RLS): 내 행만
-- ───────────────────────────────────────────────

alter table public.top_concepts enable row level security;
alter table public.sub_concepts enable row level security;
alter table public.conversations enable row level security;
alter table public.cards enable row level security;
alter table public.settings enable row level security;
alter table public.api_calls enable row level security;

-- 상위 개념은 읽기만 허용한다.
create policy top_concepts_read_own on public.top_concepts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy sub_concepts_own on public.sub_concepts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy conversations_own on public.conversations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy cards_own on public.cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy settings_own on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy api_calls_own on public.api_calls
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 권한: 로그인하지 않은 사람(anon)은 아무것도 못 한다. 로그인한 사람은 필요한 만큼만.
revoke all on table
  public.top_concepts, public.sub_concepts, public.conversations,
  public.cards, public.settings, public.api_calls
  from anon, authenticated;

grant select on table public.top_concepts to authenticated;
grant select, insert, update, delete on table
  public.sub_concepts, public.conversations, public.cards, public.settings, public.api_calls
  to authenticated;

-- ───────────────────────────────────────────────
-- 실시간 갱신(DESIGN 4.6): 카드와 하위 개념의 변경을 화면이 받는다
-- ───────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cards, public.sub_concepts;
  end if;
end
$$;
