-- Storage policies for the private 'cooks' bucket.
-- Hosted Supabase rejects storage DDL inside migrations (see migration 001),
-- so run this once in the SQL editor of a new project. Paths are
-- <owner_id>/<cook_id>/<file>.jpg — the first folder is the owner.

insert into storage.buckets (id, name, public) values ('cooks', 'cooks', false)
on conflict (id) do nothing;

-- Read: anyone allowed to view the owner's log (can_view_folder -> can_view;
-- communal today, so any member). Keeps photos in step with cook-row visibility.
-- Needs migration 20261012000003 (can_view_folder) applied first.
create policy "cooks viewers select" on storage.objects for select to authenticated
  using (bucket_id = 'cooks' and public.can_view_folder((storage.foldername(name))[1]));

-- Write: owner only.
create policy "cooks owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'cooks' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cooks owner update" on storage.objects for update to authenticated
  using (bucket_id = 'cooks' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cooks' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cooks owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cooks' and (storage.foldername(name))[1] = auth.uid()::text);
