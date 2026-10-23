-- =====================================================================
-- S13c — voice mood input v1 signals (docs/s13-opus-voice-plan.md, B4)
-- Executed in local agent mode under charter §11.2: backup first, block
-- by block, readback against the EXPECTED lines, adversarial suite with
-- positive controls, logged in SESSION_LOG.md with the backup filename.
--
-- What this does: ADDITIVE ONLY. Two new tables, nothing existing touched.
--
--   voice_moods: one row per spoken mood — the TRANSCRIPT TEXT (never
--     audio), the bar's category, and what it mapped to (category, chip,
--     refiner, go-to, price chip), whether it mapped at all, and which
--     provider/model parsed it and how long it took.
--   voice_events: what happened to the five cards a mood produced —
--     shown, tap (expand / title), play (trailer / where to watch),
--     share, save, star. "Ignored" = shown with no other event.
--   Anon client ids, the spoken text and titles only. No personal data.
--
-- Posture (the go_tos pattern): RLS ENABLED, ZERO client policies,
-- REVOKE ALL from anon/authenticated, explicit service_role grants
-- (Data-API grants rule). Service-role routes only (/api/mood, /api/voice,
-- /api/stats).
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- ---------------------------------------------------------------------
select to_regclass('public.voice_moods') as voice_moods_exists,
       to_regclass('public.voice_events') as voice_events_exists;

-- EXPECTED: one row — both NULL. ANYTHING ELSE: STOP.


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION (one transaction: all of it or none of it).
-- ---------------------------------------------------------------------
begin;

create table public.voice_moods (
  id uuid primary key default gen_random_uuid(),
  client_id text not null check (char_length(client_id) between 8 and 64),
  transcript text not null check (char_length(transcript) between 1 and 300),
  bar_category text check (bar_category in ('movies', 'tv', 'books', 'wine')),
  category text check (category in ('movies', 'tv', 'books', 'wine')),
  chip text check (char_length(chip) <= 40),
  refiner text check (char_length(refiner) <= 40),
  go_to text check (char_length(go_to) <= 200),
  price text check (price in ('under20', '20to35', '35to60', 'splurge')),
  mapped boolean not null,
  provider text check (char_length(provider) <= 20),
  model text check (char_length(model) <= 60),
  ms integer check (ms between 0 and 600000),
  created_at timestamptz not null default now()
);
create index voice_moods_created_idx on public.voice_moods (created_at);
alter table public.voice_moods enable row level security;
revoke all on table public.voice_moods from anon, authenticated;
grant select, insert on table public.voice_moods to service_role;

create table public.voice_events (
  id bigint generated always as identity primary key,
  mood_id uuid not null references public.voice_moods (id) on delete cascade,
  client_id text not null check (char_length(client_id) between 8 and 64),
  kind text not null check (kind in ('shown', 'tap', 'play', 'share', 'save', 'star')),
  title text not null check (char_length(title) between 1 and 200),
  position smallint check (position between 0 and 9),
  created_at timestamptz not null default now()
);
create index voice_events_mood_idx on public.voice_events (mood_id);
create index voice_events_created_idx on public.voice_events (created_at);
alter table public.voice_events enable row level security;
revoke all on table public.voice_events from anon, authenticated;
grant select, insert on table public.voice_events to service_role;

commit;

-- EXPECTED: BEGIN / CREATE TABLE / CREATE INDEX / ALTER TABLE / REVOKE /
-- GRANT / CREATE TABLE / CREATE INDEX / CREATE INDEX / ALTER TABLE /
-- REVOKE / GRANT / COMMIT


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK. Each query states its expected output.
-- ---------------------------------------------------------------------
select relname, relrowsecurity from pg_class
where oid in ('public.voice_moods'::regclass, 'public.voice_events'::regclass) order by relname;
-- EXPECTED: voice_events | t ; voice_moods | t

select count(*) as policies from pg_policy
where polrelid in ('public.voice_moods'::regclass, 'public.voice_events'::regclass);
-- EXPECTED: 0

select count(*) as client_grants
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('voice_moods', 'voice_events')
  and grantee in ('anon', 'authenticated');
-- EXPECTED: 0

select table_name, string_agg(privilege_type, ',' order by privilege_type) as service_grants
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('voice_moods', 'voice_events') and grantee = 'service_role'
group by table_name order by table_name;
-- EXPECTED: at least INSERT,SELECT on both (Supabase default privileges
-- also give service_role the rest, as on wine_marks and go_tos — service
-- only).


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH POSITIVE CONTROLS (§2.9).
-- Run the whole block at once. It ends in ROLLBACK.
-- ---------------------------------------------------------------------
begin;

set local role service_role;
insert into public.voice_moods (id, client_id, transcript, bar_category, category, chip, refiner, mapped, provider, model, ms)
  values ('00000000-0000-4000-8000-000000000013', 'anon_s13_selftest', 'something goofy', 'movies', 'movies', 'Comedy', 'Feel-good', true, 'openai', 'gpt-4o-mini', 900);
insert into public.voice_events (mood_id, client_id, kind, title, position)
  values ('00000000-0000-4000-8000-000000000013', 'anon_s13_selftest', 'shown', 'Paddington 2', 0),
         ('00000000-0000-4000-8000-000000000013', 'anon_s13_selftest', 'play', 'Paddington 2', 0);
select 'POSITIVE CONTROL 1: service_role writes a mood and two events' as check,
       (select count(*) from public.voice_moods where client_id = 'anon_s13_selftest') = 1
       and (select count(*) from public.voice_events where client_id = 'anon_s13_selftest') = 2
       as pass;
reset role;
-- EXPECTED: pass = t

do $$
begin
  begin
    insert into public.voice_moods (client_id, transcript, mapped) values ('anon_s13_o1', '', false);
    raise notice 'FAIL: empty transcript accepted';
  exception when check_violation then raise notice 'PASS: empty transcript refused'; end;
  begin
    insert into public.voice_moods (client_id, transcript, mapped) values ('anon_s13_o2', repeat('x', 301), false);
    raise notice 'FAIL: 301-char transcript accepted';
  exception when check_violation then raise notice 'PASS: over-long transcript refused'; end;
  begin
    insert into public.voice_moods (client_id, transcript, price, mapped) values ('anon_s13_o3', 'cheap', 'free', true);
    raise notice 'FAIL: unknown price chip accepted';
  exception when check_violation then raise notice 'PASS: unknown price chip refused'; end;
  begin
    insert into public.voice_moods (client_id, transcript, category, mapped) values ('anon_s13_o4', 'x', 'music', true);
    raise notice 'FAIL: music category accepted (S14)';
  exception when check_violation then raise notice 'PASS: music category refused'; end;
  begin
    insert into public.voice_events (mood_id, client_id, kind, title) values ('00000000-0000-4000-8000-000000000013', 'anon_s13_o5', 'pageview', 'x');
    raise notice 'FAIL: unknown event kind accepted';
  exception when check_violation then raise notice 'PASS: unknown event kind refused'; end;
  begin
    insert into public.voice_events (mood_id, client_id, kind, title) values (gen_random_uuid(), 'anon_s13_o6', 'tap', 'x');
    raise notice 'FAIL: event for a mood that does not exist accepted';
  exception when foreign_key_violation then raise notice 'PASS: orphan event refused'; end;
end $$;
-- EXPECTED: six PASS notices.

set local role anon;
do $$
begin
  begin perform 1 from public.voice_moods limit 1; raise notice 'FAIL: anon SELECT voice_moods';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT voice_moods refused'; end;
  begin insert into public.voice_moods (client_id, transcript, mapped) values ('anon_s13_attack', 'x', true); raise notice 'FAIL: anon INSERT voice_moods';
  exception when insufficient_privilege then raise notice 'PASS: anon INSERT voice_moods refused'; end;
  begin perform 1 from public.voice_events limit 1; raise notice 'FAIL: anon SELECT voice_events';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT voice_events refused'; end;
  begin insert into public.voice_events (mood_id, client_id, kind, title) values ('00000000-0000-4000-8000-000000000013', 'anon_s13_attack', 'tap', 'x'); raise notice 'FAIL: anon INSERT voice_events';
  exception when insufficient_privilege then raise notice 'PASS: anon INSERT voice_events refused'; end;
end $$;
reset role;
set local role authenticated;
do $$
begin
  begin perform 1 from public.voice_moods limit 1; raise notice 'FAIL: authenticated SELECT voice_moods';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT voice_moods refused'; end;
  begin insert into public.voice_moods (client_id, transcript, mapped) values ('anon_s13_attack', 'x', true); raise notice 'FAIL: authenticated INSERT voice_moods';
  exception when insufficient_privilege then raise notice 'PASS: authenticated INSERT voice_moods refused'; end;
  begin perform 1 from public.voice_events limit 1; raise notice 'FAIL: authenticated SELECT voice_events';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT voice_events refused'; end;
end $$;
reset role;
-- EXPECTED: seven PASS notices.

rollback;
-- EXPECTED: ROLLBACK (nothing from this block persists)


-- ---------------------------------------------------------------------
-- BLOCK 5 — ROLLBACK OF THE MIGRATION (Brad's call only; drops the
-- spoken-mood history).
-- ---------------------------------------------------------------------
-- begin;
-- drop table public.voice_events;
-- drop table public.voice_moods;
-- commit;
