-- 결과·최종 산출물 첨부 파일 저장소(PLAN 37). 비공개 버킷 하나와, 내 폴더(사용자 id/…)만 읽고 쓰는 규칙을 만든다.
-- 파일은 브라우저가 이 버킷으로 직접 올린다(서버·Vercel을 거치지 않으므로 4.5MB 제한을 받지 않는다). 로그인하지 않은 사람(anon)에게는 아무 규칙도 주지 않는다.
--  - 버킷 id: trail-files (비공개, 파일 하나 최대 25MB)
--  - 경로: <사용자 id>/<노드 id>/<무작위>-<파일 이름>  → 첫 폴더가 내 id일 때만 접근 가능
-- ※ Supabase 설정을 바꾸는 일이라 적용 전에 사용자 확인을 받는다(CLAUDE.md).

insert into storage.buckets (id, name, public, file_size_limit)
values ('trail-files', 'trail-files', false, 26214400)
on conflict (id) do nothing;

create policy trail_files_select_own on storage.objects for select to authenticated
  using (bucket_id = 'trail-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy trail_files_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'trail-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy trail_files_update_own on storage.objects for update to authenticated
  using (bucket_id = 'trail-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'trail-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy trail_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'trail-files' and (storage.foldername(name))[1] = auth.uid()::text);
