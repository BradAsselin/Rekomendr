-- =====================================================================
-- S4 — the card is the product (docs/s4-s5-build-plan.md)
-- Executed in local agent mode under charter §11.2: backup first, block
-- by block, readback against the EXPECTED lines, adversarial suite with
-- positive controls, logged in SESSION_LOG.md with the backup filename.
--
-- What this does — ADDITIVE ONLY. Nothing is dropped, narrowed or
-- rewritten; every new column is nullable, so every existing row (the
-- Lioness card 99a1a2a4-… included) is untouched and keeps opening.
--
--   1. anchor_snapshots gains seven nullable columns:
--        sender_name    — "from Katrina": the sender's name at share time
--        media_kind     — 'movie' | 'tv', resolved once from TMDb
--        media_id       — TMDb id, so a reopen never re-guesses by name
--        poster_path    — TMDb poster path for the link preview + card
--        trailer_url    — official trailer (YouTube)
--        providers      — the LAST GOOD where-to-watch answer (jsonb)
--        providers_at   — when it was fetched (the 12h refresh clock)
--      `providers` is both the cache and the fallback: a reopen months
--      later refreshes it when stale; if TMDb fails it shows this.
--   2. client_profiles — one optional display name per anonymous client.
--   3. card_events — the test's instrument (sent / open / taps / save /
--      standalone launch). Anon ids and card ids only; no personal data.
--
-- Posture (the anchor_snapshots pattern): RLS ENABLED, ZERO client
-- policies, REVOKE ALL from anon/authenticated. Service-role routes only.
-- No policy joins through another table, so no companion policy needed.
--
-- PERMANENCE: nothing in this file, or anywhere in the app, deletes or
-- expires a shared card. card_events references anchor_snapshots WITHOUT
-- cascade, so even a hand-run DELETE on a card with history is refused.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- ---------------------------------------------------------------------
select
  to_regclass('public.client_profiles') as profiles_exists,
  to_regclass('public.card_events') as events_exists,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'anchor_snapshots'
      and column_name in ('sender_name','media_kind','media_id','poster_path',
                          'trailer_url','providers','providers_at')) as new_cols_present;

-- EXPECTED: one row — profiles_exists NULL, events_exists NULL,
-- new_cols_present 0. ANYTHING ELSE: STOP; do not run BLOCK 2.


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION (one transaction: all of it or none of it).
-- ---------------------------------------------------------------------
begin;

alter table public.anchor_snapshots
  add column sender_name text check (char_length(sender_name) between 1 and 40),
  add column media_kind text check (media_kind in ('movie', 'tv')),
  add column media_id integer check (media_id > 0),
  add column poster_path text check (char_length(poster_path) <= 200),
  add column trailer_url text check (char_length(trailer_url) <= 300),
  add column providers jsonb,
  add column providers_at timestamptz;

create table public.client_profiles (
  client_id text primary key check (char_length(client_id) between 8 and 64),
  display_name text not null check (char_length(display_name) between 1 and 40),
  updated_at timestamptz not null default now()
);
alter table public.client_profiles enable row level security;
revoke all on table public.client_profiles from anon, authenticated;

create table public.card_events (
  id bigint generated always as identity primary key,
  card_id uuid references public.anchor_snapshots (id),
  client_id text not null check (char_length(client_id) between 8 and 64),
  kind text not null check (kind in (
    'sent', 'open', 'tap_watch', 'tap_trailer', 'tap_buy', 'save', 'standalone_launch'
  )),
  -- open: the opener is the card's own sender (excluded from receivers)
  is_sender boolean,
  -- open: first open of this card by this client (false = reopen)
  first_open boolean,
  -- open: seconds since the card was shared
  since_send_s integer,
  -- sent: this client's FIRST own share, and the card that brought them
  -- in (the first card they opened that someone else sent). Null otherwise.
  via_card uuid,
  created_at timestamptz not null default now(),
  check (kind = 'standalone_launch' or card_id is not null)
);
create index card_events_card_kind_idx on public.card_events (card_id, kind);
create index card_events_client_created_idx on public.card_events (client_id, created_at);
alter table public.card_events enable row level security;
revoke all on table public.card_events from anon, authenticated;

grant select, insert, update on table public.client_profiles to service_role;
grant select, insert on table public.card_events to service_role;

commit;

-- EXPECTED: BEGIN / ALTER TABLE / CREATE TABLE / ALTER TABLE / REVOKE /
-- CREATE TABLE / CREATE INDEX / CREATE INDEX / ALTER TABLE / REVOKE /
-- GRANT / GRANT / COMMIT


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK. Each query states its expected output.
-- ---------------------------------------------------------------------
select count(*) as new_cols
from information_schema.columns
where table_schema = 'public' and table_name = 'anchor_snapshots'
  and column_name in ('sender_name','media_kind','media_id','poster_path',
                      'trailer_url','providers','providers_at')
  and is_nullable = 'YES';
-- EXPECTED: 7

select relname, relrowsecurity
from pg_class
where oid in ('public.client_profiles'::regclass, 'public.card_events'::regclass)
order by relname;
-- EXPECTED: card_events | t ; client_profiles | t

select count(*) as policies
from pg_policy
where polrelid in ('public.client_profiles'::regclass, 'public.card_events'::regclass);
-- EXPECTED: 0

select count(*) as client_grants
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('client_profiles', 'card_events')
  and grantee in ('anon', 'authenticated');
-- EXPECTED: 0

select count(*) as old_rows_untouched
from public.anchor_snapshots
where sender_name is not null or media_id is not null or providers is not null;
-- EXPECTED: 0 (every existing row is exactly as it was)


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH POSITIVE CONTROLS (§2.9).
-- Run the whole block at once. It ends in ROLLBACK.
-- ---------------------------------------------------------------------
begin;

set local role service_role;
insert into public.anchor_snapshots (id, client_id, item_name, item_category, short_description, mode, shared_at)
  values ('00000000-0000-4000-8000-0000000000a4'::uuid, 'anon_s4_selftest', 'Selftest', 'movies', 'x', 'similar', now());
insert into public.client_profiles (client_id, display_name) values ('anon_s4_selftest', 'Katrina');
insert into public.card_events (card_id, client_id, kind) values
  ('00000000-0000-4000-8000-0000000000a4'::uuid, 'anon_s4_selftest', 'sent');
insert into public.card_events (card_id, client_id, kind, is_sender, first_open, since_send_s) values
  ('00000000-0000-4000-8000-0000000000a4'::uuid, 'anon_s4_receiver', 'open', false, true, 60);
insert into public.card_events (client_id, kind) values ('anon_s4_receiver', 'standalone_launch');
update public.anchor_snapshots
  set sender_name = 'Katrina', media_kind = 'tv', media_id = 1, providers = '{"stream":[]}', providers_at = now()
  where client_id = 'anon_s4_selftest';
select 'POSITIVE CONTROL 1: service_role writes every new surface' as check,
       (select count(*) from public.card_events where client_id like 'anon_s4_%') = 3
       and (select display_name from public.client_profiles where client_id = 'anon_s4_selftest') = 'Katrina'
       and (select sender_name from public.anchor_snapshots where client_id = 'anon_s4_selftest') = 'Katrina'
       as pass;
reset role;
-- EXPECTED: pass = t

do $$
begin
  begin
    insert into public.card_events (client_id, kind) values ('anon_s4_selftest', 'nonsense');
    raise notice 'FAIL: unknown event kind accepted';
  exception when check_violation then raise notice 'PASS: unknown event kind refused'; end;
  begin
    insert into public.card_events (client_id, kind) values ('anon_s4_selftest', 'open');
    raise notice 'FAIL: open without a card accepted';
  exception when check_violation then raise notice 'PASS: open without a card refused'; end;
  begin
    insert into public.client_profiles (client_id, display_name) values ('anon_s4_long', repeat('x', 41));
    raise notice 'FAIL: 41-char name accepted';
  exception when check_violation then raise notice 'PASS: 41-char name refused'; end;
  begin
    update public.anchor_snapshots set media_kind = 'book' where client_id = 'anon_s4_selftest';
    raise notice 'FAIL: media_kind book accepted';
  exception when check_violation then raise notice 'PASS: bad media_kind refused'; end;
  -- Permanence: a card with history cannot be deleted out from under it.
  begin
    delete from public.anchor_snapshots where client_id = 'anon_s4_selftest';
    raise notice 'FAIL: a card with events was deletable';
  exception when foreign_key_violation then raise notice 'PASS: card with events not deletable'; end;
end $$;
-- EXPECTED: five PASS notices.

set local role anon;
do $$
begin
  begin perform 1 from public.card_events limit 1; raise notice 'FAIL: anon SELECT card_events';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT card_events refused'; end;
  begin insert into public.card_events (card_id, client_id, kind) values (null, 'anon_s4_attack', 'standalone_launch'); raise notice 'FAIL: anon INSERT card_events';
  exception when insufficient_privilege then raise notice 'PASS: anon INSERT card_events refused'; end;
  begin perform 1 from public.client_profiles limit 1; raise notice 'FAIL: anon SELECT client_profiles';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT client_profiles refused'; end;
  begin update public.client_profiles set display_name = 'Mallory'; raise notice 'FAIL: anon UPDATE client_profiles';
  exception when insufficient_privilege then raise notice 'PASS: anon UPDATE client_profiles refused'; end;
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin perform 1 from public.card_events limit 1; raise notice 'FAIL: authenticated SELECT card_events';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT card_events refused'; end;
  begin perform 1 from public.client_profiles limit 1; raise notice 'FAIL: authenticated SELECT client_profiles';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT client_profiles refused'; end;
end $$;
reset role;

select 'POSITIVE CONTROL 2: self-test rows survive the attacks' as check,
       (select count(*) from public.card_events where client_id like 'anon_s4_%') = 3
       and (select display_name from public.client_profiles where client_id = 'anon_s4_selftest') = 'Katrina'
       as pass;
-- EXPECTED: pass = t

rollback;

-- EXPECTED OVERALL: both POSITIVE CONTROL rows pass = t; eleven PASS
-- notices; zero FAIL. Afterwards the self-test rows are gone:
-- select count(*) from public.card_events;  → 0


-- ---------------------------------------------------------------------
-- BLOCK 5 — ROLLBACK (only if you need to undo; Brad's call). The app
-- fails soft without these: no sender name, live providers only, events
-- logged as `[card-event] not recorded`.
-- ---------------------------------------------------------------------
-- drop table public.card_events;
-- drop table public.client_profiles;
-- alter table public.anchor_snapshots drop column sender_name, drop column media_kind,
--   drop column media_id, drop column poster_path, drop column trailer_url,
--   drop column providers, drop column providers_at;
