-- =====================================================================
-- S8 — the wine shelf (docs/s8-wine-shelf-plan.md): wine_marks
-- Executed in local agent mode under charter §11.2: backup first, block
-- by block, readback against the EXPECTED lines, adversarial suite with
-- positive controls, logged in SESSION_LOG.md with the backup filename.
--
-- What this does: ADDITIVE ONLY. One new table, nothing existing touched.
--
--   wine_marks: one row per mark a person puts on a wine.
--     kind 'favorite' — the starred go-to (S8b). At most one LIVE favorite
--                       per client (cleared_at is null); starring another
--                       clears the old one (kept, never deleted: history).
--     kind 'bought'   — a bottle from a confirmed haul (S8c), with the rek
--                       and anchor that led to it when there was one, and
--                       the next-open follow-up answer (asked once, ever).
--   Anon client ids and wine names only. No personal data.
--
-- Posture (the anchor_snapshots pattern): RLS ENABLED, ZERO client
-- policies, REVOKE ALL from anon/authenticated, explicit service_role
-- grants (Data-API grants rule). Service-role route only (/api/wine).
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- ---------------------------------------------------------------------
select to_regclass('public.wine_marks') as wine_marks_exists;

-- EXPECTED: one row — wine_marks_exists NULL. ANYTHING ELSE: STOP.


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION (one transaction: all of it or none of it).
-- ---------------------------------------------------------------------
begin;

create table public.wine_marks (
  id uuid primary key default gen_random_uuid(),
  client_id text not null check (char_length(client_id) between 8 and 64),
  kind text not null check (kind in ('favorite', 'bought')),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 600),
  -- approximate taste position, 1..5 (dry→sweet, light→bold)
  dry_sweet smallint check (dry_sweet between 1 and 5),
  light_bold smallint check (light_bold between 1 and 5),
  price numeric(8,2) check (price >= 0 and price < 100000),
  -- bought: the haul it came in (one confirm = one haul id)
  haul_id uuid,
  -- bought: the rek that led to it, and that rek's anchor (snap-to-cart)
  from_rek text check (char_length(from_rek) <= 120),
  from_anchor text check (char_length(from_anchor) <= 120),
  -- bought: the next-open question, answered (or skipped) exactly once
  followup text check (followup in ('like', 'dislike', 'favorite', 'skipped')),
  followup_at timestamptz,
  -- favorite: replaced by a newer star (or un-starred)
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind = 'bought' or (haul_id is null and from_rek is null and followup is null))
);
create index wine_marks_client_kind_idx on public.wine_marks (client_id, kind, created_at desc);
create unique index wine_marks_one_live_favorite
  on public.wine_marks (client_id) where kind = 'favorite' and cleared_at is null;
alter table public.wine_marks enable row level security;
revoke all on table public.wine_marks from anon, authenticated;
grant select, insert, update on table public.wine_marks to service_role;

commit;

-- EXPECTED: BEGIN / CREATE TABLE / CREATE INDEX / CREATE INDEX /
-- ALTER TABLE / REVOKE / GRANT / COMMIT


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK. Each query states its expected output.
-- ---------------------------------------------------------------------
select relname, relrowsecurity from pg_class where oid = 'public.wine_marks'::regclass;
-- EXPECTED: wine_marks | t

select count(*) as policies from pg_policy where polrelid = 'public.wine_marks'::regclass;
-- EXPECTED: 0

select count(*) as client_grants
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'wine_marks'
  and grantee in ('anon', 'authenticated');
-- EXPECTED: 0

select string_agg(privilege_type, ',' order by privilege_type) as service_grants
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'wine_marks' and grantee = 'service_role';
-- EXPECTED: at least INSERT,SELECT,UPDATE (Supabase default privileges
-- also give service_role the rest; observed 2026-10-16:
-- DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE — service only)


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH POSITIVE CONTROLS (§2.9).
-- Run the whole block at once. It ends in ROLLBACK.
-- ---------------------------------------------------------------------
begin;

set local role service_role;
insert into public.wine_marks (client_id, kind, name, dry_sweet, light_bold, price)
  values ('anon_s8_selftest', 'favorite', 'Caymus Bonanza Cabernet Sauvignon', 2, 4, 16.99);
insert into public.wine_marks (client_id, kind, name, haul_id, from_rek, from_anchor)
  values ('anon_s8_selftest', 'bought', 'Cannonball Cabernet Sauvignon',
          '00000000-0000-4000-8000-0000000000b8'::uuid, 'Cannonball Cabernet Sauvignon', 'Josh Cellars Cabernet');
update public.wine_marks set followup = 'like', followup_at = now()
  where client_id = 'anon_s8_selftest' and kind = 'bought';
select 'POSITIVE CONTROL 1: service_role writes a favorite, a purchase and its follow-up' as check,
       (select count(*) from public.wine_marks where client_id = 'anon_s8_selftest') = 2
       and (select followup from public.wine_marks where client_id = 'anon_s8_selftest' and kind = 'bought') = 'like'
       as pass;
reset role;
-- EXPECTED: pass = t

do $$
begin
  begin
    insert into public.wine_marks (client_id, kind, name) values ('anon_s8_selftest', 'favorite', 'Second live favorite');
    raise notice 'FAIL: two live favorites accepted';
  exception when unique_violation then raise notice 'PASS: second live favorite refused'; end;
  begin
    insert into public.wine_marks (client_id, kind, name) values ('anon_s8_selftest', 'wishlist', 'x');
    raise notice 'FAIL: unknown kind accepted';
  exception when check_violation then raise notice 'PASS: unknown kind refused'; end;
  begin
    insert into public.wine_marks (client_id, kind, name, dry_sweet) values ('anon_s8_other1', 'favorite', 'x', 9);
    raise notice 'FAIL: taste position 9 accepted';
  exception when check_violation then raise notice 'PASS: taste position out of range refused'; end;
  begin
    insert into public.wine_marks (client_id, kind, name, followup) values ('anon_s8_other2', 'favorite', 'x', 'like');
    raise notice 'FAIL: follow-up on a favorite accepted';
  exception when check_violation then raise notice 'PASS: follow-up on a favorite refused'; end;
  begin
    insert into public.wine_marks (client_id, kind, name) values ('anon_s8_other3', 'bought', repeat('x', 121));
    raise notice 'FAIL: 121-char name accepted';
  exception when check_violation then raise notice 'PASS: 121-char name refused'; end;
end $$;
-- EXPECTED: five PASS notices.

-- POSITIVE CONTROL 2: clearing the old favorite lets a new one in.
update public.wine_marks set cleared_at = now()
  where client_id = 'anon_s8_selftest' and kind = 'favorite' and cleared_at is null;
insert into public.wine_marks (client_id, kind, name) values ('anon_s8_selftest', 'favorite', 'La Crema Pinot Noir');
select 'POSITIVE CONTROL 2: star moves after clear' as check,
       (select count(*) from public.wine_marks where client_id = 'anon_s8_selftest' and kind = 'favorite') = 2
       and (select count(*) from public.wine_marks where client_id = 'anon_s8_selftest' and kind = 'favorite' and cleared_at is null) = 1
       as pass;
-- EXPECTED: pass = t

set local role anon;
do $$
begin
  begin perform 1 from public.wine_marks limit 1; raise notice 'FAIL: anon SELECT wine_marks';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT refused'; end;
  begin insert into public.wine_marks (client_id, kind, name) values ('anon_s8_attack', 'bought', 'x'); raise notice 'FAIL: anon INSERT wine_marks';
  exception when insufficient_privilege then raise notice 'PASS: anon INSERT refused'; end;
  begin update public.wine_marks set name = 'x'; raise notice 'FAIL: anon UPDATE wine_marks';
  exception when insufficient_privilege then raise notice 'PASS: anon UPDATE refused'; end;
end $$;
reset role;
set local role authenticated;
do $$
begin
  begin perform 1 from public.wine_marks limit 1; raise notice 'FAIL: authenticated SELECT wine_marks';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT refused'; end;
  begin insert into public.wine_marks (client_id, kind, name) values ('anon_s8_attack', 'bought', 'x'); raise notice 'FAIL: authenticated INSERT wine_marks';
  exception when insufficient_privilege then raise notice 'PASS: authenticated INSERT refused'; end;
end $$;
reset role;
-- EXPECTED: five PASS notices.

rollback;
-- EXPECTED: ROLLBACK (nothing from this block persists)


-- ---------------------------------------------------------------------
-- BLOCK 5 — ROLLBACK OF THE MIGRATION (Brad's call only; never run by a
-- session). Drops the table and everything in it.
-- ---------------------------------------------------------------------
-- drop table public.wine_marks;
