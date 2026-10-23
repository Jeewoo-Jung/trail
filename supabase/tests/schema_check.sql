-- Trail 데이터 구조 시험 (PLAN 5번)
-- 시험용 사용자 둘을 임시로 만들어 "내 행만", 한도, 중복, 로그인 안 한 사람 차단을 확인한다.
-- 마지막에 일부러 오류를 내므로 어떤 변경도 남지 않는다. 결과는 오류 메시지의 "TRAIL_TEST_RESULT" 뒤에 나온다.
-- ✔는 기대대로, ✘는 기대와 다름.

do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  conv uuid;
  conv_b uuid;
  r text := '';
  n integer;
  c integer;
begin
  -- 시험용 사용자와 개념 (권한이 높은 상태에서 만든다)
  insert into auth.users (id, aud, role, email)
  values (a, 'authenticated', 'authenticated', 'a@test.invalid'),
         (b, 'authenticated', 'authenticated', 'b@test.invalid');
  insert into public.concepts (user_id, name, status) values (a, '연구', 'approved'), (b, '연구', 'approved');

  -- ───────── A로 로그인한 것처럼 ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.conversations default values returning key into conv;
  r := r || 'A1 대화 만들기 ✔|';

  begin
    insert into public.cards (conversation_key, topic_key, title, summary, keywords, evidence, candidates)
    values (conv, 't1', '제목', '요약', '{a,b}', '["근거"]', '[]');
    r := r || 'A2 올바른 카드 저장 ✔|';
  exception when others then r := r || 'A2 올바른 카드가 거절됨 ✘ ' || sqlerrm || '|'; end;

  select count(*) into n from public.cards;
  r := r || 'A3 내가 보는 카드 수=' || n || (case when n = 1 then ' ✔' else ' ✘' end) || '|';

  begin
    insert into public.cards (conversation_key, topic_key, title) values (conv, 't1', '같은 주제');
    r := r || 'A4 같은 주제 중복이 허용됨 ✘|';
  exception when unique_violation then r := r || 'A4 같은 주제 중복 거절 ✔|';
            when others then r := r || 'A4 다른 오류 ✘ ' || sqlstate || '|'; end;

  begin
    insert into public.cards (conversation_key, topic_key, title, summary) values (conv, 't2', '제목', repeat('가', 501));
    r := r || 'A5 요약 501자가 허용됨 ✘|';
  exception when check_violation then r := r || 'A5 요약 501자 거절 ✔|';
            when others then r := r || 'A5 다른 오류 ✘ ' || sqlstate || '|'; end;

  begin
    insert into public.cards (conversation_key, topic_key, title, summary) values (conv, 't2', '제목', repeat('가', 500));
    delete from public.cards where topic_key = 't2';
    r := r || 'A5b 요약 500자 허용 ✔|';
  exception when others then r := r || 'A5b 요약 500자가 거절됨 ✘ ' || sqlerrm || '|'; end;

  begin
    insert into public.cards (conversation_key, topic_key, title, evidence) values (conv, 't2', '제목', '["a","b","c","d"]');
    r := r || 'A6 근거 4개가 허용됨 ✘|';
  exception when check_violation then r := r || 'A6 근거 4개 거절 ✔|';
            when others then r := r || 'A6 다른 오류 ✘ ' || sqlstate || '|'; end;

  begin
    insert into public.cards (conversation_key, topic_key, title, evidence)
    values (conv, 't2', '제목', jsonb_build_array(repeat('가', 301)));
    r := r || 'A7 근거 301자가 허용됨 ✘|';
  exception when check_violation then r := r || 'A7 근거 301자 거절 ✔|';
            when others then r := r || 'A7 다른 오류 ✘ ' || sqlstate || '|'; end;

  begin
    insert into public.cards (conversation_key, topic_key, title, evidence)
    values (conv, 't2', '제목', jsonb_build_array(repeat('가', 300), 'b', 'c'));
    delete from public.cards where topic_key = 't2';
    r := r || 'A7b 근거 3개·300자 허용 ✔|';
  exception when others then r := r || 'A7b 근거 3개·300자가 거절됨 ✘ ' || sqlerrm || '|'; end;

  begin
    insert into public.cards (conversation_key, topic_key, title, keywords)
    values (conv, 't2', '제목', '{1,2,3,4,5,6,7,8}');
    r := r || 'A8 개념어 8개가 허용됨 ✘|';
  exception when check_violation then r := r || 'A8 개념어 8개 거절 ✔|';
            when others then r := r || 'A8 다른 오류 ✘ ' || sqlstate || '|'; end;

  begin
    insert into public.cards (conversation_key, topic_key, title, candidates)
    values (conv, 't2', '제목', '[{},{},{},{}]');
    r := r || 'A9 분류 후보 4개가 허용됨 ✘|';
  exception when check_violation then r := r || 'A9 분류 후보 4개 거절 ✔|';
            when others then r := r || 'A9 다른 오류 ✘ ' || sqlstate || '|'; end;

  begin
    insert into public.cards (conversation_key, topic_key, title) values (conv, 't2', '   ');
    r := r || 'A10 빈 제목이 허용됨 ✘|';
  exception when check_violation then r := r || 'A10 빈 제목 거절 ✔|';
            when others then r := r || 'A10 다른 오류 ✘ ' || sqlstate || '|'; end;

  begin
    insert into public.cards (conversation_key, topic_key, title, classification_status)
    values (conv, 't2', '제목', '엉뚱한값');
    r := r || 'A11 잘못된 분류 상태가 허용됨 ✘|';
  exception when check_violation then r := r || 'A11 잘못된 분류 상태 거절 ✔|';
            when others then r := r || 'A11 다른 오류 ✘ ' || sqlstate || '|'; end;

  -- 대화당 10장: 이미 1장이 있으니 9장을 더 넣으면 10장, 11번째는 거절
  for i in 2..10 loop
    insert into public.cards (conversation_key, topic_key, title) values (conv, 'k' || i, '제목');
  end loop;
  select card_count into c from public.conversations where key = conv;
  r := r || 'A12 10장째까지 저장, 카드 수=' || c || (case when c = 10 then ' ✔' else ' ✘' end) || '|';

  begin
    insert into public.cards (conversation_key, topic_key, title) values (conv, 'k11', '열한 번째');
    r := r || 'A13 11장째가 허용됨 ✘|';
  exception when check_violation then r := r || 'A13 11장째 거절 ✔|';
            when others then r := r || 'A13 다른 오류 ✘ ' || sqlstate || '|'; end;

  delete from public.cards where topic_key = 'k10';
  select card_count into c from public.conversations where key = conv;
  r := r || 'A14 카드 지운 뒤 카드 수=' || c || (case when c = 9 then ' ✔' else ' ✘' end) || '|';

  begin
    insert into public.concepts (name) values ('내가 만든 개념');
    r := r || 'A15 내 개념 만들기 ✔|';
  exception when others then r := r || 'A15 내 개념 만들기 실패 ✘ ' || sqlerrm || '|'; end;

  begin
    insert into public.cards (user_id, conversation_key, topic_key, title) values (b, conv, 'x', '남의 이름으로');
    r := r || 'A16 남의 이름으로 저장이 허용됨 ✘|';
  exception when insufficient_privilege then r := r || 'A16 남의 이름으로 저장 막힘 ✔|';
            when others then r := r || 'A16 다른 오류 ✘ ' || sqlstate || '|'; end;

  select count(*) into n from public.concepts;
  r := r || 'A17 내가 보는 개념 수=' || n || (case when n = 2 then ' ✔' else ' ✘' end) || '|';

  begin
    insert into public.settings (always_excluded) values ('{주제1}');
    insert into public.api_calls (kind, window_start, count) values ('minute', date_trunc('minute', now()), 1);
    r := r || 'A18 설정·호출 횟수 저장 ✔|';
  exception when others then r := r || 'A18 설정·호출 횟수 저장 실패 ✘ ' || sqlerrm || '|'; end;

  -- ───────── B로 바꿔서: A의 것이 보이거나 바뀌면 안 된다 ─────────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.cards;
  r := r || 'B1 B가 보는 카드 수=' || n || (case when n = 0 then ' ✔' else ' ✘' end) || '|';
  select count(*) into n from public.conversations;
  r := r || 'B2 B가 보는 대화 수=' || n || (case when n = 0 then ' ✔' else ' ✘' end) || '|';
  select count(*) into n from public.settings;
  r := r || 'B3 B가 보는 설정 수=' || n || (case when n = 0 then ' ✔' else ' ✘' end) || '|';
  select count(*) into n from public.concepts;
  r := r || 'B4 B가 보는 개념 수=' || n || (case when n = 1 then ' ✔(자기 것만)' else ' ✘' end) || '|';

  update public.cards set title = '가로챔';
  get diagnostics n = row_count;
  r := r || 'B5 A의 카드를 고친 줄 수=' || n || (case when n = 0 then ' ✔' else ' ✘' end) || '|';
  delete from public.cards;
  get diagnostics n = row_count;
  r := r || 'B6 A의 카드를 지운 줄 수=' || n || (case when n = 0 then ' ✔' else ' ✘' end) || '|';

  -- ───────── 로그인하지 않은 사람 ─────────
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;

  begin
    perform 1 from public.cards limit 1;
    r := r || 'C1 로그인 안 한 사람이 카드를 읽을 수 있음 ✘|';
  exception when insufficient_privilege then r := r || 'C1 로그인 안 한 사람 차단 ✔|';
            when others then r := r || 'C1 다른 오류 ✘ ' || sqlstate || '|'; end;

  reset role;

  -- 개념을 지우면 카드의 개념만 비워지고 카드는 남는다
  insert into public.conversations (user_id) values (b) returning key into conv_b;
  insert into public.cards (user_id, conversation_key, topic_key, title, concept_id)
  select b, conv_b, 'tt', '제목', id from public.concepts where user_id = b;
  delete from public.concepts where user_id = b;
  select count(*) into n from public.cards where conversation_key = conv_b and concept_id is null;
  r := r || 'D1 개념을 지워도 카드는 남음=' || n || (case when n = 1 then ' ✔' else ' ✘' end) || '|';

  -- 실시간 목록에 카드·개념이 올라갔는지 (이 프로젝트에 해당 목록이 있을 때만 의미가 있다)
  select count(*) into n from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('cards', 'concepts');
  r := r || 'E1 실시간 목록의 표 수=' || n || (case when n = 2 then ' ✔' else ' ✘' end) || '|';

  raise exception 'TRAIL_TEST_RESULT %', r;
end
$test$;
