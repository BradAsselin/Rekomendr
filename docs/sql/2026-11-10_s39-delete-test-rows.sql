-- Session 39 — delete the builder's test rows (approved by Brad 2026-11-10,
-- including the 13 agent anchor_snapshots under charter §2.13).
-- The eleven DELETEs are exactly the ones in the Session 38 log entry, in that order.
-- Backup first: backups/2026-11-10-1221-s39.sql (996,529 bytes, taken 2026-11-10 12:21).
-- Expected counts are the read-only re-counts taken 2026-11-10 just before this ran
-- (same as Session 38). Any mismatch raises, and the whole transaction rolls back.
--
-- Run:  psql "$SUPABASE_DB_URL" -X -f docs/sql/2026-11-10_s39-delete-test-rows.sql
\set ON_ERROR_STOP on
begin;
do $$
declare n bigint;
begin
  delete from card_events      where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'card_events %', n;      if n <> 22   then raise exception 'card_events % <> 22', n; end if;
  delete from anchor_snapshots where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'anchor_snapshots %', n; if n <> 13   then raise exception 'anchor_snapshots % <> 13', n; end if;
  delete from voice_events     where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'voice_events %', n;     if n <> 252  then raise exception 'voice_events % <> 252', n; end if;
  delete from voice_moods      where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'voice_moods %', n;      if n <> 255  then raise exception 'voice_moods % <> 255', n; end if;
  delete from goto_events      where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'goto_events %', n;      if n <> 475  then raise exception 'goto_events % <> 475', n; end if;
  delete from go_tos           where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'go_tos %', n;           if n <> 136  then raise exception 'go_tos % <> 136', n; end if;
  delete from user_likes       where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'user_likes %', n;       if n <> 54   then raise exception 'user_likes % <> 54', n; end if;
  delete from reksnap_signals  where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'reksnap_signals %', n;  if n <> 30   then raise exception 'reksnap_signals % <> 30', n; end if;
  delete from wine_marks       where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'wine_marks %', n;       if n <> 29   then raise exception 'wine_marks % <> 29', n; end if;
  delete from client_profiles  where client_id like 'anon\_agent\_%';
  get diagnostics n = row_count; raise notice 'client_profiles %', n;  if n <> 2    then raise exception 'client_profiles % <> 2', n; end if;
  delete from api_usage        where client_id like 'anon\_agent\_%'
                                  or client_id like 's27test-%'
                                  or client_id like 'anon\_test\_%'
                                  or client_id ~ '^anon_s3[0-9]+[-_]live';
  get diagnostics n = row_count; raise notice 'api_usage %', n;        if n <> 2216 then raise exception 'api_usage % <> 2216', n; end if;
end $$;
commit;
