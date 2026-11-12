-- Private selfie bucket. Uploads go through the Storage API; this file only
-- creates the bucket row and the policies. Files live at {user id}/{name}.jpg.

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'selfies',
    'selfies',
    false,
    8388608,
    array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
exception
  when undefined_column then
    raise notice 'Bucket insert failed because storage.buckets has changed. Create a private bucket named selfies (8 MB, jpeg/png/webp) in the dashboard, then re-run this file.';
end $$;

create policy cj_selfies_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'selfies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy cj_selfies_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'selfies'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.sees_all())
      or (
        (select private.my_role()) = 'supervisor'
        and exists (
          select 1 from public.profiles p
          where p.id = ((storage.foldername(name))[1])::uuid
            and p.branch_id = (select private.my_branch())
        )
      )
    )
  );

create policy cj_selfies_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'selfies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'selfies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
