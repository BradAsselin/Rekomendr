-- =====================================================================
-- S1 — the 'watched' signal
-- Session 1 (staleness), charter §6. NOT EXECUTED BY THE SESSION (§2.9).
-- Brad runs this in the Supabase SQL editor, one block at a time.
--
-- What this changes: ONE CHECK constraint on an existing table, so that
-- user_likes.action will accept 'watched' alongside the four values it
-- already takes. That is the whole migration.
--
-- What this deliberately does NOT change:
--   * No new table. The Shortlist reads through /api/prefs, exactly as
--     the charter specifies ("no new schema").
--   * No new GRANT and no new REVOKE. The 'watched' row is written by
--     /api/signals/watched with the SERVICE ROLE key, which bypasses
--     RLS — so anon needs no new privilege, and is given none.
--   * No new RLS policy, for the same reason.
--   * Nothing is dropped and no data is rewritten. Every existing row
--     stays valid: the new constraint is a strict superset of the old.
--
-- Order matters. Run BLOCK 1 first and read its output — the constraint's
-- real name and its current definition come from your database, not from
-- this file's guess.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- Tells you what the constraint is actually called and what it currently
-- allows. Run this and keep the output; BLOCK 3 is checked against it.
-- ---------------------------------------------------------------------
select
  con.conname                              as constraint_name,
  pg_get_constraintdef(con.oid)            as definition
from pg_constraint con
join pg_class rel  on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and rel.relname = 'user_likes'
  and con.contype = 'c'
order by con.conname;

-- EXPECTED: one row, named something like `user_likes_action_check`,
-- whose definition lists the four current actions, e.g.
--   CHECK (action = ANY (ARRAY['like','dislike','save','more_like_this']))
--
-- IF YOU GET ZERO ROWS: there is no CHECK constraint on this table, so
-- 'watched' already inserts fine and NOTHING here needs to run. Skip to
-- BLOCK 4 and confirm — the app is already working.
--
-- IF THE NAME IS NOT `user_likes_action_check`: put the real name into
-- BLOCK 2 below before running it.


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION.
-- Replaces the constraint with the same list plus 'watched'.
-- Wrapped in a transaction: if the ADD fails, the DROP is rolled back
-- too, and the table is never left with no constraint at all.
-- ---------------------------------------------------------------------
begin;

alter table public.user_likes
  drop constraint if exists user_likes_action_check;

alter table public.user_likes
  add constraint user_likes_action_check
  check (action in ('like', 'dislike', 'save', 'more_like_this', 'watched'));

commit;

-- EXPECTED: "Success. No rows returned."
-- If BLOCK 1 showed a DIFFERENT constraint name, change BOTH statements
-- above to that name before running. If BLOCK 1 showed EXTRA action
-- values beyond the four listed, add them to the check list above too —
-- this list must be a superset of what BLOCK 1 printed, or existing rows
-- will fail validation and the whole transaction will roll back (which
-- is the safe outcome, not a broken table).


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK. Proves the constraint now says what you think.
-- ---------------------------------------------------------------------
select pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel  on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and rel.relname = 'user_likes'
  and con.conname = 'user_likes_action_check';

-- EXPECTED: the definition now contains 'watched'.


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH A POSITIVE CONTROL (§2.9).
-- Proving only that the bad case is rejected proves nothing — a table
-- that rejects everything would pass that test. So this asserts both
-- directions and then cleans up after itself.
--
-- Run the whole block at once. It ends in ROLLBACK, so it writes nothing
-- permanent: it is a test, not a migration step.
-- ---------------------------------------------------------------------
begin;

-- POSITIVE CONTROL A: the new value is now accepted.
insert into public.user_likes (client_id, category, title, year, action)
values ('anon_migration_selftest', 'Movies', 'S1 Self Test', 2026, 'watched');

-- POSITIVE CONTROL B: the values that always worked still work
-- (i.e. the new constraint did not narrow anything).
insert into public.user_likes (client_id, category, title, year, action)
values ('anon_migration_selftest', 'Movies', 'S1 Self Test', 2026, 'like');

-- NEGATIVE: a junk action is still refused. This statement MUST fail
-- with 'new row ... violates check constraint'. That error is the PASS
-- condition for this line — run it last, on its own, after the two
-- inserts above have succeeded.
--
--   insert into public.user_likes (client_id, category, title, year, action)
--   values ('anon_migration_selftest', 'Movies', 'S1 Self Test', 2026, 'nonsense');

-- Both controls inserted? Then the constraint is right.
rollback;

-- EXPECTED: the two inserts succeed, the rollback leaves no trace, and
-- uncommenting the negative statement produces a check-constraint error.
-- Confirm nothing survived:
select count(*) as should_be_zero
from public.user_likes
where client_id = 'anon_migration_selftest';
