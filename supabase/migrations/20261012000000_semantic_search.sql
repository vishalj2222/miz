-- Phase 2 slice: semantic search over cooks.
-- cook.embedding (vector(1024), voyage-3.5) has existed since migration 001;
-- this adds the index and the match function.

create index if not exists cook_embedding_hnsw
  on public.cook using hnsw (embedding vector_cosine_ops);

-- security invoker: RLS on cook still decides which rows the caller may see.
-- Backfill rows are included on purpose — they're hidden from feeds, not search.
create or replace function public.match_cooks(
  query_embedding vector(1024),
  p_owner uuid,
  match_count int default 20
)
returns table(id uuid, similarity float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.id, 1 - (c.embedding <=> query_embedding) as similarity
  from public.cook c
  where c.owner_id = p_owner
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

grant execute on function public.match_cooks(vector, uuid, int) to authenticated;
