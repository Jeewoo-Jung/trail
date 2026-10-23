-- 산출물 링크는 http(s)만 저장한다(앱 규칙을 데이터베이스에도 건다: 토큰이 새어 표를 직접 고치더라도 javascript: 같은 주소가 들어가지 않게).
alter table public.outputs
  add constraint outputs_url_http check (url is null or url ~* '^https?://[^[:space:]]+$');
