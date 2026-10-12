-- Storage read policy helper: can the caller view the log that owns this
-- storage folder (<owner_id>/...)? Wraps can_view() with a safe uuid parse,
-- so a malformed path is simply "no" rather than a cast error. Used by the
-- "cooks viewers select" policy in supabase/storage-policies.sql.
create or replace function public.can_view_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_view(folder::uuid)
    else false
  end;
$$;

grant execute on function public.can_view_folder(text) to authenticated;
