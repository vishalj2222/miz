-- A short note on a process photo ("searing at high heat"). Owners edit it
-- through the existing photo_update policy; enrichment reads it.
alter table public.photo add column if not exists caption text not null default '';
