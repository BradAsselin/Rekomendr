-- =====================================================================
-- S23 — grants tightening (Brad approved 2026-10-25; baseline:
-- docs/sql/grants-snapshot-2026-10.md; rule: BUILD_CHARTER §11.2a).
-- Executed in local agent mode under charter §11.2: backup first, block
-- by block, readback against the EXPECTED lines, adversarial suite with
-- positive controls, logged in SESSION_LOG.md with the backup filename.
--
-- What this does: NARROWS PRIVILEGES ONLY. No table, row, column or
-- policy is created, dropped or changed, with one exception: the
-- api_usage.route CHECK is WIDENED by one value ('signals', the cap key
-- for the new /api/signals route). That is not destructive (every
-- existing row still passes).
--
-- After S23 the app's code reads and writes these tables only through
-- service-role routes (/api/signals, /api/signals/watched,
-- /api/signals/undo, /api/prefs, /api/saved, /api/auth/merge). Signed-in
-- users do nothing on them through the Data API (sign-in is GoTrue, in
-- the auth schema).
--
-- ONE STEP IS STAGED, NOT RUN HERE: anon/authenticated INSERT on
-- user_likes and reksnap_signals. Preview and production share this
-- database, and production (release/v2) still writes likes and snap
-- signals from the browser until S23 is promoted. Revoking INSERT now
-- would drop every production like and snap signal until then. BLOCK 5
-- is that revoke: run it right after promotion.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- ---------------------------------------------------------------------
select c.relname, r.rolname,
       string_agg(p.priv, ',' order by p.priv) as privs
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
cross join (values ('anon'), ('authenticated')) r(rolname)
cross join lateral (select unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) priv) p
where c.relname in ('user_likes', 'reksnap_signals', 'account_devices')
  and has_table_privilege(r.rolname, c.oid, p.priv)
group by c.relname, r.rolname order by 1, 2;
-- EXPECTED: six rows, each DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
-- (the 2026-10-25 snapshot). ANYTHING ELSE: STOP.

select pg_get_constraintdef(oid) from pg_constraint where conname = 'api_usage_route_check';
-- EXPECTED: CHECK ((route = ANY (ARRAY['openai'::text, 'recipe'::text,
-- 'reksnap-vision'::text, 'reksnap-text'::text])))


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION (one transaction: all of it or none of it).
-- ---------------------------------------------------------------------
begin;

-- The cap key for /api/signals.
alter table public.api_usage drop constraint api_usage_route_check;
alter table public.api_usage add constraint api_usage_route_check
  check (route in ('openai', 'recipe', 'reksnap-vision', 'reksnap-text', 'signals'));

-- reksnap_signals: INSERT stays until promotion (BLOCK 5); nothing else.
revoke select, update, delete, truncate, references, trigger
  on table public.reksnap_signals from anon, authenticated;

-- user_likes: INSERT stays until promotion (BLOCK 5); nothing else. The
-- "authenticated select own rows" policy stays but goes dormant (no grant):
-- every read is /api/prefs or /api/saved.
revoke select, update, delete, truncate, references, trigger
  on table public.user_likes from anon, authenticated;

-- account_devices: written only by /api/auth/merge (service role); no
-- browser code reads it. The "authenticated read own devices" policy stays
-- but goes dormant.
revoke all on table public.account_devices from anon, authenticated;

-- Identity sequences: INSERT on an identity column needs no sequence
-- privilege; no public role calls nextval/setval.
revoke all on sequence public.api_usage_id_seq, public.card_events_id_seq,
  public.goto_events_id_seq, public.user_likes_id_seq, public.voice_events_id_seq
  from anon, authenticated;

commit;

-- EXPECTED: BEGIN / ALTER TABLE / ALTER TABLE / REVOKE / REVOKE / REVOKE /
-- REVOKE / COMMIT


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK. Each query states its expected output.
-- ---------------------------------------------------------------------
select c.relname, r.rolname,
       coalesce(string_agg(p.priv, ',' order by p.priv), '(none)') as privs
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
cross join (values ('anon'), ('authenticated')) r(rolname)
left join lateral (select unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) priv) p
  on has_table_privilege(r.rolname, c.oid, p.priv)
where c.relkind = 'r'
group by c.relname, r.rolname order by 1, 2;
-- EXPECTED: user_likes and reksnap_signals: INSERT for anon and
-- authenticated; every other row (24 total): (none).

select c.relname, r.rolname,
       has_sequence_privilege(r.rolname, c.oid, 'USAGE') as usage,
       has_sequence_privilege(r.rolname, c.oid, 'SELECT') as sel,
       has_sequence_privilege(r.rolname, c.oid, 'UPDATE') as upd
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
cross join (values ('anon'), ('authenticated')) r(rolname)
where c.relkind = 'S' order by 1, 2;
-- EXPECTED: ten rows, all f / f / f.

select pg_get_constraintdef(oid) from pg_constraint where conname = 'api_usage_route_check';
-- EXPECTED: ... 'reksnap-text'::text, 'signals'::text])))

select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not relrowsecurity;
-- EXPECTED: 0 rows (RLS still on everywhere).


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH POSITIVE CONTROLS (§2.9).
-- Run the whole block at once. It ends in ROLLBACK.
-- ---------------------------------------------------------------------
begin;

-- account_devices.user_id references auth.users: borrow a real id (psql gset).
select id as s23_uid from auth.users order by created_at limit 1 \gset

set local role service_role;
insert into public.user_likes (client_id, category, title, action)
  values ('anon_s23_selftest', 'Movies', 'Self Test', 'like');
insert into public.reksnap_signals (client_id, item_name, item_category, action)
  values ('anon_s23_selftest', 'Self Test', 'wine', 'dislike');
insert into public.account_devices (user_id, client_id)
  values (:'s23_uid', 'anon_s23_selftest');
insert into public.api_usage (client_id, route) values ('anon_s23_selftest', 'signals');
select 'POSITIVE CONTROL 1: service_role writes likes, signals, devices, a signals cap row' as check,
       (select count(*) from public.user_likes where client_id = 'anon_s23_selftest') = 1
       and (select count(*) from public.reksnap_signals where client_id = 'anon_s23_selftest') = 1
       and (select count(*) from public.account_devices where client_id = 'anon_s23_selftest') = 1
       and (select count(*) from public.api_usage where client_id = 'anon_s23_selftest' and route = 'signals') = 1
       as pass;
reset role;
-- EXPECTED: pass = t

set local role anon;
-- POSITIVE CONTROL 2: production's browser writes still land until promotion
-- (identity INSERT with the sequence privileges revoked).
insert into public.user_likes (client_id, category, title, action)
  values ('anon_s23_selftest_b', 'Movies', 'Browser Path', 'like');
insert into public.reksnap_signals (client_id, item_name, item_category, action)
  values ('anon_s23_selftest_b', 'Browser Path', 'wine', 'like');
select 'POSITIVE CONTROL 2: anon INSERT on user_likes + reksnap_signals still works' as check, true as pass;
do $$
begin
  begin perform 1 from public.user_likes limit 1; raise notice 'FAIL: anon SELECT user_likes';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT user_likes refused'; end;
  begin update public.user_likes set title = 'x'; raise notice 'FAIL: anon UPDATE user_likes';
  exception when insufficient_privilege then raise notice 'PASS: anon UPDATE user_likes refused'; end;
  begin delete from public.user_likes; raise notice 'FAIL: anon DELETE user_likes';
  exception when insufficient_privilege then raise notice 'PASS: anon DELETE user_likes refused'; end;
  begin truncate public.user_likes; raise notice 'FAIL: anon TRUNCATE user_likes';
  exception when insufficient_privilege then raise notice 'PASS: anon TRUNCATE user_likes refused'; end;
  begin perform 1 from public.reksnap_signals limit 1; raise notice 'FAIL: anon SELECT reksnap_signals';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT reksnap_signals refused'; end;
  begin delete from public.reksnap_signals; raise notice 'FAIL: anon DELETE reksnap_signals';
  exception when insufficient_privilege then raise notice 'PASS: anon DELETE reksnap_signals refused'; end;
  begin truncate public.reksnap_signals; raise notice 'FAIL: anon TRUNCATE reksnap_signals';
  exception when insufficient_privilege then raise notice 'PASS: anon TRUNCATE reksnap_signals refused'; end;
  begin perform 1 from public.account_devices limit 1; raise notice 'FAIL: anon SELECT account_devices';
  exception when insufficient_privilege then raise notice 'PASS: anon SELECT account_devices refused'; end;
  begin insert into public.account_devices (user_id, client_id) values (gen_random_uuid(), 'anon_s23_attack'); raise notice 'FAIL: anon INSERT account_devices';
  exception when insufficient_privilege then raise notice 'PASS: anon INSERT account_devices refused'; end;
  begin perform nextval('public.user_likes_id_seq'); raise notice 'FAIL: anon nextval';
  exception when insufficient_privilege then raise notice 'PASS: anon nextval refused'; end;
  begin perform setval('public.card_events_id_seq', 1); raise notice 'FAIL: anon setval';
  exception when insufficient_privilege then raise notice 'PASS: anon setval refused'; end;
end $$;
reset role;
-- EXPECTED: pass = t, then eleven PASS notices.

set local role authenticated;
do $$
begin
  begin perform 1 from public.user_likes limit 1; raise notice 'FAIL: authenticated SELECT user_likes';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT user_likes refused'; end;
  begin update public.reksnap_signals set item_name = 'x'; raise notice 'FAIL: authenticated UPDATE reksnap_signals';
  exception when insufficient_privilege then raise notice 'PASS: authenticated UPDATE reksnap_signals refused'; end;
  begin perform 1 from public.account_devices limit 1; raise notice 'FAIL: authenticated SELECT account_devices';
  exception when insufficient_privilege then raise notice 'PASS: authenticated SELECT account_devices refused'; end;
  begin delete from public.account_devices; raise notice 'FAIL: authenticated DELETE account_devices';
  exception when insufficient_privilege then raise notice 'PASS: authenticated DELETE account_devices refused'; end;
  begin perform setval('public.user_likes_id_seq', 1); raise notice 'FAIL: authenticated setval';
  exception when insufficient_privilege then raise notice 'PASS: authenticated setval refused'; end;
end $$;
reset role;
-- EXPECTED: five PASS notices.

do $$
begin
  begin
    insert into public.api_usage (client_id, route) values ('anon_s23_attack', 'pageview');
    raise notice 'FAIL: unknown cap route accepted';
  exception when check_violation then raise notice 'PASS: unknown cap route refused'; end;
end $$;
-- EXPECTED: one PASS notice.

rollback;
-- EXPECTED: ROLLBACK (nothing from this block persists)


-- ---------------------------------------------------------------------
-- BLOCK 5 — STAGED: RUN ONLY AFTER S23 IS PROMOTED TO PRODUCTION.
-- (Production's browser bundle must be writing through /api/signals.)
-- Same §11.2 discipline: backup, run, readback, adversarial.
-- ---------------------------------------------------------------------
-- begin;
-- revoke insert on table public.user_likes, public.reksnap_signals from anon, authenticated;
-- commit;
--
-- READBACK: rerun BLOCK 3's first query.
-- EXPECTED: all 24 rows (none). Public roles then hold nothing on any table.
--
-- ADVERSARIAL (ends in ROLLBACK):
-- begin;
-- set local role anon;
-- do $$ begin
--   begin insert into public.user_likes (client_id, category, title, action) values ('anon_s23_attack', 'Movies', 'x', 'like'); raise notice 'FAIL: anon INSERT user_likes';
--   exception when insufficient_privilege then raise notice 'PASS: anon INSERT user_likes refused'; end;
--   begin insert into public.reksnap_signals (client_id, item_name, item_category, action) values ('anon_s23_attack', 'x', 'wine', 'like'); raise notice 'FAIL: anon INSERT reksnap_signals';
--   exception when insufficient_privilege then raise notice 'PASS: anon INSERT reksnap_signals refused'; end;
-- end $$;
-- reset role;
-- rollback;
-- EXPECTED: two PASS notices. POSITIVE CONTROL: a like and a snap thumbs-down
-- through the app (/api/signals) land, read back in Saved / prefs.
