-- Imported cooks start with a provisional main photo; enrichment picks the
-- real one (the finished dish). cover_auto marks a cover the AI may still
-- change. Choosing a main photo by hand turns it off for good.
alter table public.cook add column if not exists cover_auto boolean not null default false;

create or replace function public.set_cover_photo(p_photo_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.photo
  set is_cover = (id = p_photo_id)
  where cook_id = (select cook_id from public.photo where id = p_photo_id);
  update public.cook
  set cover_auto = false
  where id = (select cook_id from public.photo where id = p_photo_id);
$$;

-- Enrichment's pick. A no-op once the owner has chosen by hand, so a late
-- enrichment can't undo "Make main". security invoker: RLS applies.
create or replace function public.auto_cover_photo(p_cook_id uuid, p_storage_path text)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.photo
  set is_cover = (storage_path = p_storage_path)
  where cook_id = p_cook_id
    and exists (select 1 from public.cook where id = p_cook_id and cover_auto)
    and exists (select 1 from public.photo where cook_id = p_cook_id and storage_path = p_storage_path);
$$;

grant execute on function public.auto_cover_photo(uuid, text) to authenticated;
