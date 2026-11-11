-- =====================================================================
-- S40 — Measure (docs/2026-11-10_measure_launch.md): two new tables.
-- Run block by block under charter §11.2 (backup first, readback after
-- each block, adversarial suite with positive control, log the backup).
-- §11.2a: RLS on, explicit grants, sequence grant, prove the grant.
--
--   1. measure_events — one small counter row per thing that happened.
--      §0: counts, never content. No titles, words, photos or names.
--      Server rows (Block 2 quality): retry, retry_failed, error, late —
--        lane + day only, NO client id.
--      Client rows (sent through /api/signals, kind "measure"):
--        search        — a new search's set reached the screen: how it
--                        started (origin), its category, the lane, how
--                        many picks were shown (0-5) and the ms from the
--                        ask to the set. client_id kept (active devices).
--        compare_on    — Compare to switched on: category only.
--                        client_id kept (distinct devices).
--        nudge_asked / nudge_poster / nudge_not_yet — the home "Did you
--                        watch one of these?" line: the count only,
--                        client_id NOT stored.
--   2. house_devices — Brad's and Katrina's phones, so the readout can
--      show "outside the house". Server-only. Seeded from the two most
--      active real devices since the test start (2026-10-16); Brad
--      confirms them from the readout's first-eight characters.
--
-- Posture (the api_usage pattern): server-only, no policies (§11.2a b).
-- REVOKE ALL from anon/authenticated; service_role select/insert/update/
-- delete; usage+select on the identity sequence for service_role.
-- Nothing existing is altered. The app fails soft without these tables
-- (a counter that cannot write logs and moves on; the readout shows "—").
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- ---------------------------------------------------------------------
select to_regclass('public.measure_events') as measure_exists,
       to_regclass('public.house_devices') as house_exists;
-- EXPECTED: one row, both NULL. ANYTHING ELSE: STOP.


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION (one transaction: all of it or none of it).
-- ---------------------------------------------------------------------
begin;

create table public.measure_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in (
    'retry', 'retry_failed', 'error', 'late',
    'search', 'compare_on', 'nudge_asked', 'nudge_poster', 'nudge_not_yet'
  )),
  lane text check (lane in ('search', 'snap', 'wine')),
  origin text check (origin in ('voice', 'typed', 'chips', 'snap', 'mlt')),
  category text check (category in ('movies', 'tv', 'books', 'wine', 'other')),
  picks smallint check (picks between 0 and 5),
  ms integer check (ms between 0 and 3600000),
  client_id text check (char_length(client_id) between 8 and 64),
  created_at timestamptz not null default now(),
  -- Server quality rows never carry a device id.
  check (kind not in ('retry', 'retry_failed', 'error', 'late') or client_id is null),
  -- Nudge counts never carry a device id either.
  check (kind not in ('nudge_asked', 'nudge_poster', 'nudge_not_yet') or client_id is null)
);
create index measure_events_created_idx on public.measure_events (created_at);
-- Server-only, no policies.
alter table public.measure_events enable row level security;
revoke all on table public.measure_events from anon, authenticated;
grant select, insert, update, delete on table public.measure_events to service_role;
grant usage, select on sequence public.measure_events_id_seq to service_role;

create table public.house_devices (
  client_id text primary key check (char_length(client_id) between 8 and 64),
  note text check (char_length(note) <= 60),
  added_at timestamptz not null default now()
);
-- Server-only, no policies.
alter table public.house_devices enable row level security;
revoke all on table public.house_devices from anon, authenticated;
grant select, insert, update, delete on table public.house_devices to service_role;

commit;

-- EXPECTED: BEGIN / CREATE TABLE / CREATE INDEX / ALTER TABLE / REVOKE /
-- GRANT / GRANT / CREATE TABLE / ALTER TABLE / REVOKE / GRANT / COMMIT


-- ---------------------------------------------------------------------
-- BLOCK 2b — SEED THE HOUSE (the two most active real devices since
-- 2026-10-16, by rows across api_usage, card_events, user_likes,
-- voice_moods, go_tos, wine_marks: anon_89c… 407 rows, anon_3f5… 58).
-- Matched by prefix; each prefix must match exactly one device or the
-- whole block rolls back. Brad confirms or corrects from the readout.
-- ---------------------------------------------------------------------
begin;
do $$
declare n int;
begin
  insert into public.house_devices (client_id, note)
  select distinct client_id, 'seed: most active since 2026-10-16 (1)' from (
    select client_id from public.api_usage union select client_id from public.card_events
    union select client_id from public.user_likes
  ) x where client_id like 'anon_89c%';
  insert into public.house_devices (client_id, note)
  select distinct client_id, 'seed: most active since 2026-10-16 (2)' from (
    select client_id from public.api_usage union select client_id from public.card_events
    union select client_id from public.user_likes
  ) x where client_id like 'anon_3f5%';
  select count(*) into n from public.house_devices;
  if n <> 2 then raise exception 'house seed matched % devices, expected 2', n; end if;
end $$;
commit;

select left(client_id, 8) as id8, note from public.house_devices order by note;
-- EXPECTED: anon_89c | seed … (1) ; anon_3f5 | seed … (2)


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK.
-- ---------------------------------------------------------------------
select relname, relrowsecurity from pg_class
where oid in ('public.measure_events'::regclass, 'public.house_devices'::regclass) order by relname;
-- EXPECTED: house_devices | t ; measure_events | t

select count(*) as policies from pg_policy
where polrelid in ('public.measure_events'::regclass, 'public.house_devices'::regclass);
-- EXPECTED: 0

select count(*) as client_grants from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('measure_events', 'house_devices')
  and grantee in ('anon', 'authenticated');
-- EXPECTED: 0

select table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('measure_events', 'house_devices')
  and grantee = 'service_role'
group by table_name order by table_name;
-- EXPECTED: house_devices | DELETE,INSERT,SELECT,UPDATE
--           measure_events | DELETE,INSERT,SELECT,UPDATE

select has_sequence_privilege('service_role', 'public.measure_events_id_seq', 'usage') as seq_usage;
-- EXPECTED: t


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH POSITIVE CONTROLS. Ends in ROLLBACK.
-- ---------------------------------------------------------------------
begin;

set local role service_role;
insert into public.measure_events (kind, lane) values ('retry', 'search');
insert into public.measure_events (kind, lane, origin, category, picks, ms, client_id)
  values ('search', 'search', 'voice', 'movies', 5, 4200, 'anon_agent_s40_selftest');
insert into public.measure_events (kind, category, client_id) values ('compare_on', 'tv', 'anon_agent_s40_selftest');
insert into public.measure_events (kind) values ('nudge_asked');
select 'POSITIVE CONTROL 1: service_role writes and reads' as check,
       (select count(*) from public.measure_events where created_at > now() - interval '1 minute') = 4
       and (select count(*) from public.house_devices) = 2 as pass;
reset role;
-- EXPECTED: pass = t

do $$
begin
  begin insert into public.measure_events (kind) values ('nonsense'); raise notice 'FAIL: unknown kind accepted';
  exception when check_violation then raise notice 'PASS: unknown kind refused'; end;
  begin insert into public.measure_events (kind, client_id) values ('retry', 'anon_agent_s40_x'); raise notice 'FAIL: server row with a device id accepted';
  exception when check_violation then raise notice 'PASS: server row with a device id refused'; end;
  begin insert into public.measure_events (kind, client_id) values ('nudge_poster', 'anon_agent_s40_x'); raise notice 'FAIL: nudge row with a device id accepted';
  exception when check_violation then raise notice 'PASS: nudge row with a device id refused'; end;
  begin insert into public.measure_events (kind, picks) values ('search', 6); raise notice 'FAIL: 6 picks accepted';
  exception when check_violation then raise notice 'PASS: 6 picks refused'; end;
  begin insert into public.measure_events (kind, category) values ('compare_on', 'Casablanca'); raise notice 'FAIL: a title as category accepted';
  exception when check_violation then raise notice 'PASS: a title as category refused'; end;
end $$;
-- EXPECTED: five PASS notices.

set local role anon;
do $$
begin
  begin perform 1 from public.measure_events limit 1; raise notice 'FAIL: anon SELECT measure_events';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT measure_events refused'; end;
  begin insert into public.measure_events (kind) values ('nudge_asked'); raise notice 'FAIL: anon INSERT measure_events';
  exception when insufficient_privilege then raise notice 'PASS: anon INSERT measure_events refused'; end;
  begin perform 1 from public.house_devices limit 1; raise notice 'FAIL: anon SELECT house_devices';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT house_devices refused'; end;
  begin delete from public.house_devices; raise notice 'FAIL: anon DELETE house_devices';
  exception when insufficient_privilege then raise notice 'PASS: anon DELETE house_devices refused'; end;
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin perform 1 from public.measure_events limit 1; raise notice 'FAIL: authenticated SELECT measure_events';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT measure_events refused'; end;
  begin perform 1 from public.house_devices limit 1; raise notice 'FAIL: authenticated SELECT house_devices';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT house_devices refused'; end;
end $$;
reset role;

select 'POSITIVE CONTROL 2: rows survive the attacks' as check,
       (select count(*) from public.measure_events where created_at > now() - interval '1 minute') = 4
       and (select count(*) from public.house_devices) = 2 as pass;
-- EXPECTED: pass = t

rollback;
-- EXPECTED OVERALL: both POSITIVE CONTROLs t, eleven PASS, zero FAIL;
-- afterwards measure_events has 0 rows, house_devices keeps its 2.


-- ---------------------------------------------------------------------
-- BLOCK 5 — ROLLBACK (Brad's call only). The app fails soft without them.
-- ---------------------------------------------------------------------
-- drop table public.measure_events;
-- drop table public.house_devices;
--
-- Correcting the house list (Brad): see the readout's "House devices"
-- lines, then e.g.
--   delete from public.house_devices where client_id like 'anon_3f5%';
--   insert into public.house_devices (client_id, note)
--     select distinct client_id, 'Katrina' from public.api_usage where client_id like 'anon_XXX%';
