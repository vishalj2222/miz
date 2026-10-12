-- backfill_source added a 5-arg create_cook (p_source default 'own') but left
-- the 4-arg version in place. A 4-arg RPC call then matches both and PostgREST
-- rejects it as ambiguous, so the capture flush never creates the cook.
-- The 5-arg version covers every caller; drop the old one.
drop function if exists public.create_cook(uuid, timestamptz, text, text);
