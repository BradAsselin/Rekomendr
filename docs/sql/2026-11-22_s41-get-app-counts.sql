-- =====================================================================
-- S41 — Get the app counts (docs/2026-11-22_get_the_app_launch.md, item 5).
-- Widens measure_events' allowed `kind` list by eight count-only events.
-- Run block by block under charter §11.2 (backup first, readback after
-- each block, adversarial suite with positive control, log the backup).
-- §11.2a: no new table; grants are unchanged (nothing is granted or
-- revoked here). Nothing is deleted: every existing row still passes.
--
--   getapp_open        — "Get the app" opened (any door)
--   install_accepted   — Chrome's own install prompt: accepted
--   install_dismissed  — Chrome's own install prompt: dismissed
--   getapp_got_it      — the sheet's "Got it"
--   home_ask_shown     — home's "Put Rekomendr on your home screen" shown
--   home_ask_how       — …its "How"
--   home_ask_x         — …its ×
--   card_open_app      — "Open Rekomendr" (or "Find more like this →")
--                        tapped on a shared card
-- §0: counts only. Like the nudge counts, these rows can never hold a
-- device id (a CHECK says so), a title or a word.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- ---------------------------------------------------------------------
select conname from pg_constraint
where conrelid = 'public.measure_events'::regclass and contype = 'c'
order by conname;
-- EXPECTED (read 2026-11-22): nine rows — measure_events_category_check,
--   measure_events_check, measure_events_check1, measure_events_client_id_check,
--   measure_events_kind_check, measure_events_lane_check, measure_events_ms_check,
--   measure_events_origin_check, measure_events_picks_check.
-- The one this file replaces is measure_events_kind_check; it must be there.
select count(*) as kind_check from pg_constraint
where conrelid = 'public.measure_events'::regclass and conname = 'measure_events_kind_check';
-- EXPECTED: 1. ANYTHING ELSE: STOP.


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION (one transaction: all of it or none of it).
-- ---------------------------------------------------------------------
begin;

alter table public.measure_events drop constraint measure_events_kind_check;
alter table public.measure_events add constraint measure_events_kind_check check (kind in (
  'retry', 'retry_failed', 'error', 'late',
  'search', 'compare_on', 'nudge_asked', 'nudge_poster', 'nudge_not_yet',
  'getapp_open', 'install_accepted', 'install_dismissed', 'getapp_got_it',
  'home_ask_shown', 'home_ask_how', 'home_ask_x', 'card_open_app'
));
-- The new counts never carry a device id.
alter table public.measure_events add constraint measure_events_getapp_no_device check (
  kind not in ('getapp_open', 'install_accepted', 'install_dismissed', 'getapp_got_it',
               'home_ask_shown', 'home_ask_how', 'home_ask_x', 'card_open_app')
  or client_id is null
);

commit;

-- EXPECTED: BEGIN / ALTER TABLE / ALTER TABLE / ALTER TABLE / COMMIT


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK.
-- ---------------------------------------------------------------------
select conname from pg_constraint
where conrelid = 'public.measure_events'::regclass
  and conname in ('measure_events_kind_check', 'measure_events_getapp_no_device')
order by conname;
-- EXPECTED: measure_events_getapp_no_device ; measure_events_kind_check

select count(*) as client_grants from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'measure_events'
  and grantee in ('anon', 'authenticated');
-- EXPECTED: 0 (unchanged)

select relrowsecurity from pg_class where oid = 'public.measure_events'::regclass;
-- EXPECTED: t (unchanged)


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH POSITIVE CONTROLS. Ends in ROLLBACK.
-- ---------------------------------------------------------------------
begin;

set local role service_role;
insert into public.measure_events (kind) values
  ('getapp_open'), ('install_accepted'), ('install_dismissed'), ('getapp_got_it'),
  ('home_ask_shown'), ('home_ask_how'), ('home_ask_x'), ('card_open_app');
insert into public.measure_events (kind) values ('nudge_asked');
select 'POSITIVE CONTROL 1: the eight new counts and an old one write' as check,
       (select count(*) from public.measure_events where created_at > now() - interval '1 minute'
          and client_id is null and kind in ('getapp_open', 'install_accepted', 'install_dismissed',
          'getapp_got_it', 'home_ask_shown', 'home_ask_how', 'home_ask_x', 'card_open_app', 'nudge_asked')) = 9 as pass;
reset role;
-- EXPECTED: pass = t

do $$
begin
  begin insert into public.measure_events (kind) values ('getapp_nonsense'); raise notice 'FAIL: unknown kind accepted';
  exception when check_violation then raise notice 'PASS: unknown kind refused'; end;
  begin insert into public.measure_events (kind, client_id) values ('getapp_open', 'anon_agent_s41_x'); raise notice 'FAIL: get-app row with a device id accepted';
  exception when check_violation then raise notice 'PASS: get-app row with a device id refused'; end;
  begin insert into public.measure_events (kind, client_id) values ('card_open_app', 'anon_agent_s41_x'); raise notice 'FAIL: card-open row with a device id accepted';
  exception when check_violation then raise notice 'PASS: card-open row with a device id refused'; end;
  begin insert into public.measure_events (kind, client_id) values ('nudge_poster', 'anon_agent_s41_x'); raise notice 'FAIL: nudge row with a device id accepted';
  exception when check_violation then raise notice 'PASS: nudge row with a device id still refused'; end;
end $$;
-- EXPECTED: four PASS notices.

set local role anon;
do $$
begin
  begin insert into public.measure_events (kind) values ('getapp_open'); raise notice 'FAIL: anon INSERT measure_events';
  exception when insufficient_privilege then raise notice 'PASS: anon INSERT measure_events refused'; end;
end $$;
reset role;

select 'POSITIVE CONTROL 2: rows survive the attacks' as check,
       (select count(*) from public.measure_events where created_at > now() - interval '1 minute' and client_id is null
          and kind in ('getapp_open', 'install_accepted', 'install_dismissed', 'getapp_got_it',
          'home_ask_shown', 'home_ask_how', 'home_ask_x', 'card_open_app', 'nudge_asked')) = 9 as pass;
-- EXPECTED: pass = t

rollback;
-- EXPECTED OVERALL: both POSITIVE CONTROLs t, five PASS, zero FAIL.


-- ---------------------------------------------------------------------
-- BLOCK 5 — ROLLBACK (Brad's call only). Run only if no new-kind rows
-- exist yet (the old check would refuse them).
-- ---------------------------------------------------------------------
-- begin;
-- alter table public.measure_events drop constraint measure_events_getapp_no_device;
-- alter table public.measure_events drop constraint measure_events_kind_check;
-- alter table public.measure_events add constraint measure_events_kind_check check (kind in (
--   'retry', 'retry_failed', 'error', 'late',
--   'search', 'compare_on', 'nudge_asked', 'nudge_poster', 'nudge_not_yet'));
-- commit;
