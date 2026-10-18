-- =====================================================================
-- S12 — go-tos across categories (docs/s12-gotos-steer-plan.md)
-- Executed in local agent mode under charter §11.2: backup first, block
-- by block, readback against the EXPECTED lines, adversarial suite with
-- positive controls, logged in SESSION_LOG.md with the backup filename.
--
-- What this does: ADDITIVE ONLY. Two new tables, nothing existing touched
-- (wine keeps its one live go-to in wine_marks, exactly as S8 built it).
--
--   go_tos: one row per go-to a person stars on a movie, show or book.
--     Many live per category; at most one LIVE row per (client, category,
--     name). Un-starring sets cleared_at (kept, never deleted: history).
--     tmdb_kind/tmdb_id/genre_ids are TMDb's, for screens only — they let
--     the server find the nearest go-to and its recommendation web.
--   goto_events: counts for /api/stats (touchstones shown and starred,
--     "+ More like this" from a go-to, Steer by switches, sets shown with
--     their repeat count). No names, no text.
--   Anon client ids and titles only. No personal data.
--
-- Posture (the wine_marks pattern): RLS ENABLED, ZERO client policies,
-- REVOKE ALL from anon/authenticated, explicit service_role grants
-- (Data-API grants rule). Service-role route only (/api/gotos, /api/slots).
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- ---------------------------------------------------------------------
select to_regclass('public.go_tos') as go_tos_exists,
       to_regclass('public.goto_events') as goto_events_exists;

-- EXPECTED: one row — both NULL. ANYTHING ELSE: STOP.


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION (one transaction: all of it or none of it).
-- ---------------------------------------------------------------------
begin;

create table public.go_tos (
  id uuid primary key default gen_random_uuid(),
  client_id text not null check (char_length(client_id) between 8 and 64),
  category text not null check (category in ('movies', 'tv', 'books')),
  name text not null check (char_length(name) between 1 and 200),
  year smallint check (year between 1870 and 2100),
  tmdb_kind text check (tmdb_kind in ('movie', 'tv')),
  tmdb_id integer check (tmdb_id > 0),
  genre_ids integer[] check (cardinality(genre_ids) <= 12),
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  check ((tmdb_kind is null) = (tmdb_id is null)),
  check (category <> 'books' or tmdb_id is null)
);
create index go_tos_client_idx on public.go_tos (client_id, category, created_at desc);
create unique index go_tos_one_live_per_name
  on public.go_tos (client_id, category, lower(name)) where cleared_at is null;
alter table public.go_tos enable row level security;
revoke all on table public.go_tos from anon, authenticated;
grant select, insert, update on table public.go_tos to service_role;

create table public.goto_events (
  id bigint generated always as identity primary key,
  client_id text not null check (char_length(client_id) between 8 and 64),
  kind text not null check (kind in
    ('touchstone_shown', 'touchstone_star', 'goto_more', 'steer_switch', 'set_shown')),
  category text check (category in ('movies', 'tv', 'books', 'wine')),
  repeats smallint not null default 0 check (repeats between 0 and 50),
  created_at timestamptz not null default now()
);
create index goto_events_created_idx on public.goto_events (created_at);
alter table public.goto_events enable row level security;
revoke all on table public.goto_events from anon, authenticated;
grant select, insert on table public.goto_events to service_role;

commit;

-- EXPECTED: BEGIN / CREATE TABLE / CREATE INDEX / CREATE INDEX /
-- ALTER TABLE / REVOKE / GRANT / CREATE TABLE / CREATE INDEX /
-- ALTER TABLE / REVOKE / GRANT / COMMIT


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK. Each query states its expected output.
-- ---------------------------------------------------------------------
select relname, relrowsecurity from pg_class
where oid in ('public.go_tos'::regclass, 'public.goto_events'::regclass) order by relname;
-- EXPECTED: go_tos | t ; goto_events | t

select count(*) as policies from pg_policy
where polrelid in ('public.go_tos'::regclass, 'public.goto_events'::regclass);
-- EXPECTED: 0

select count(*) as client_grants
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('go_tos', 'goto_events')
  and grantee in ('anon', 'authenticated');
-- EXPECTED: 0

select table_name, string_agg(privilege_type, ',' order by privilege_type) as service_grants
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('go_tos', 'goto_events') and grantee = 'service_role'
group by table_name order by table_name;
-- EXPECTED: at least INSERT,SELECT,UPDATE on go_tos and INSERT,SELECT on
-- goto_events (Supabase default privileges also give service_role the
-- rest, as observed on wine_marks 2026-10-16 — service only).


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH POSITIVE CONTROLS (§2.9).
-- Run the whole block at once. It ends in ROLLBACK.
-- ---------------------------------------------------------------------
begin;

set local role service_role;
insert into public.go_tos (client_id, category, name, year, tmdb_kind, tmdb_id, genre_ids)
  values ('anon_s12_selftest', 'tv', 'Lioness', 2023, 'tv', 113962, '{18,10759}');
insert into public.go_tos (client_id, category, name, year, tmdb_kind, tmdb_id, genre_ids)
  values ('anon_s12_selftest', 'tv', 'Slow Horses', 2022, 'tv', 95480, '{18,80}');
insert into public.go_tos (client_id, category, name) values ('anon_s12_selftest', 'books', 'The Martian');
insert into public.goto_events (client_id, kind, category, repeats)
  values ('anon_s12_selftest', 'set_shown', 'tv', 0);
select 'POSITIVE CONTROL 1: service_role writes two TV go-tos, a book and an event' as check,
       (select count(*) from public.go_tos where client_id = 'anon_s12_selftest' and cleared_at is null) = 3
       and (select count(*) from public.goto_events where client_id = 'anon_s12_selftest') = 1
       as pass;
reset role;
-- EXPECTED: pass = t

do $$
begin
  begin
    insert into public.go_tos (client_id, category, name) values ('anon_s12_selftest', 'tv', 'LIONESS');
    raise notice 'FAIL: the same live go-to twice accepted';
  exception when unique_violation then raise notice 'PASS: duplicate live go-to refused'; end;
  begin
    insert into public.go_tos (client_id, category, name) values ('anon_s12_selftest', 'wine', 'x');
    raise notice 'FAIL: wine category accepted (wine lives in wine_marks)';
  exception when check_violation then raise notice 'PASS: wine category refused'; end;
  begin
    insert into public.go_tos (client_id, category, name, tmdb_kind) values ('anon_s12_o1', 'tv', 'x', 'tv');
    raise notice 'FAIL: tmdb_kind without tmdb_id accepted';
  exception when check_violation then raise notice 'PASS: half a TMDb reference refused'; end;
  begin
    insert into public.go_tos (client_id, category, name, tmdb_kind, tmdb_id) values ('anon_s12_o2', 'books', 'x', 'movie', 5);
    raise notice 'FAIL: a TMDb id on a book accepted';
  exception when check_violation then raise notice 'PASS: TMDb id on a book refused'; end;
  begin
    insert into public.goto_events (client_id, kind) values ('anon_s12_o3', 'pageview');
    raise notice 'FAIL: unknown event kind accepted';
  exception when check_violation then raise notice 'PASS: unknown event kind refused'; end;
  begin
    insert into public.goto_events (client_id, kind, repeats) values ('anon_s12_o4', 'set_shown', 99);
    raise notice 'FAIL: repeats 99 accepted';
  exception when check_violation then raise notice 'PASS: repeats out of range refused'; end;
end $$;
-- EXPECTED: six PASS notices.

-- POSITIVE CONTROL 2: un-starring frees the name to be starred again.
update public.go_tos set cleared_at = now()
  where client_id = 'anon_s12_selftest' and category = 'tv' and name = 'Lioness';
insert into public.go_tos (client_id, category, name) values ('anon_s12_selftest', 'tv', 'Lioness');
select 'POSITIVE CONTROL 2: re-star after un-star' as check,
       (select count(*) from public.go_tos where client_id = 'anon_s12_selftest' and name = 'Lioness') = 2
       and (select count(*) from public.go_tos where client_id = 'anon_s12_selftest' and name = 'Lioness' and cleared_at is null) = 1
       as pass;
-- EXPECTED: pass = t

set local role anon;
do $$
begin
  begin perform 1 from public.go_tos limit 1; raise notice 'FAIL: anon SELECT go_tos';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT go_tos refused'; end;
  begin insert into public.go_tos (client_id, category, name) values ('anon_s12_attack', 'tv', 'x'); raise notice 'FAIL: anon INSERT go_tos';
  exception when insufficient_privilege then raise notice 'PASS: anon INSERT go_tos refused'; end;
  begin update public.go_tos set name = 'x'; raise notice 'FAIL: anon UPDATE go_tos';
  exception when insufficient_privilege then raise notice 'PASS: anon UPDATE go_tos refused'; end;
  begin perform 1 from public.goto_events limit 1; raise notice 'FAIL: anon SELECT goto_events';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT goto_events refused'; end;
  begin insert into public.goto_events (client_id, kind) values ('anon_s12_attack', 'goto_more'); raise notice 'FAIL: anon INSERT goto_events';
  exception when insufficient_privilege then raise notice 'PASS: anon INSERT goto_events refused'; end;
end $$;
reset role;
set local role authenticated;
do $$
begin
  begin perform 1 from public.go_tos limit 1; raise notice 'FAIL: authenticated SELECT go_tos';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT go_tos refused'; end;
  begin insert into public.go_tos (client_id, category, name) values ('anon_s12_attack', 'tv', 'x'); raise notice 'FAIL: authenticated INSERT go_tos';
  exception when insufficient_privilege then raise notice 'PASS: authenticated INSERT go_tos refused'; end;
  begin perform 1 from public.goto_events limit 1; raise notice 'FAIL: authenticated SELECT goto_events';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT goto_events refused'; end;
end $$;
reset role;
-- EXPECTED: eight PASS notices.

rollback;
-- EXPECTED: ROLLBACK (nothing from this block persists)


-- ---------------------------------------------------------------------
-- BLOCK 5 — ROLLBACK OF THE MIGRATION (Brad's call only; never run by a
-- session). Drops both tables and everything in them.
-- ---------------------------------------------------------------------
-- drop table public.goto_events;
-- drop table public.go_tos;
