-- Multiple photos per cook: the main (cover) shot plus process shots.
-- The photo table always allowed many rows per cook; this adds ordering,
-- and owner-only update/delete so photos can be re-covered or removed.

alter table public.photo add column if not exists taken_at timestamptz;
alter table public.photo add column if not exists created_at timestamptz not null default now();

create policy photo_update on public.photo for update
  using (exists (select 1 from public.cook c where c.id = photo.cook_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.cook c where c.id = photo.cook_id and c.owner_id = auth.uid()));
create policy photo_delete on public.photo for delete
  using (exists (select 1 from public.cook c where c.id = photo.cook_id and c.owner_id = auth.uid()));

-- Atomically make one photo the cook's cover. security invoker: RLS applies,
-- so only the cook's owner can move the cover.
create or replace function public.set_cover_photo(p_photo_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.photo
  set is_cover = (id = p_photo_id)
  where cook_id = (select cook_id from public.photo where id = p_photo_id);
$$;

grant execute on function public.set_cover_photo(uuid) to authenticated;

-- Storage: removing a photo also deletes its file, which needs an owner-scoped
-- DELETE policy on the cooks bucket. Hosted Supabase rejects storage DDL in
-- migrations (see 001), so create it once via the SQL editor:
--   create policy "cooks owner delete" on storage.objects for delete to authenticated
--     using (bucket_id = 'cooks' and (storage.foldername(name))[1] = auth.uid()::text);
