-- =====================================================================
-- S2 — anchor_snapshots (the snapshot IS the save)
-- Session 2 (shareable anchors), charter §6. NOT EXECUTED BY THE SESSION
-- (§2.9). Brad runs this in the Supabase SQL editor, one block at a time.
--
-- What this creates: ONE new table, public.anchor_snapshots, plus one
-- index. Rows are minted PRIVATE at save-tap by /api/save; Share flips
-- shared_at on an existing row (/api/share); the public page and the
-- preview image read one row by its unguessable id (Ledger #18/#19).
--
-- Posture (the account_devices pattern):
--   * RLS ENABLED, ZERO client policies. Every read and write goes
--     through a service-role server route, which bypasses RLS.
--   * REVOKE ALL from anon and authenticated. Grants gate the TABLE,
--     policies gate the ROWS; this table ships before Supabase's
--     2026-10-30 Data-API grants enforcement and would otherwise inherit
--     auto-grants that contradict the zero-policy design. Belt and
--     suspenders — both are asserted in BLOCK 3 and BLOCK 4.
--   * No policy joins through another table, so no companion read
--     policy is needed anywhere (§2.9).
--
-- Nothing existing is altered. Rollback is one line (BLOCK 5).
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- ---------------------------------------------------------------------
select to_regclass('public.anchor_snapshots') as already_exists;

-- EXPECTED: one row, already_exists = NULL.
-- IF IT IS NOT NULL: the table exists already — STOP and tell the next
-- session; do not run BLOCK 2 on top of it.


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION (one transaction: all of it or none of it).
-- ---------------------------------------------------------------------
begin;

create table public.anchor_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id text not null check (char_length(client_id) between 8 and 64),
  item_name text not null check (char_length(item_name) between 1 and 200),
  item_category text not null check (char_length(item_category) between 1 and 100),
  short_description text not null check (char_length(short_description) <= 2000),
  long_description text check (char_length(long_description) <= 4000),
  mode text not null check (mode in ('similar', 'uses', 'alternatives')),
  shared_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Serves the mint cap + dedupe (/api/save), the flip cap (/api/share),
-- and the future S4 saved-list read — all keyed by client, newest first.
create index anchor_snapshots_client_created_idx
  on public.anchor_snapshots (client_id, created_at desc);

alter table public.anchor_snapshots enable row level security;
-- Deliberately NO policies.

revoke all on table public.anchor_snapshots from anon, authenticated;

commit;

-- EXPECTED: "Success. No rows returned."


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK. Each query states its expected output.
-- ---------------------------------------------------------------------
select relname, relrowsecurity
from pg_class
where oid = 'public.anchor_snapshots'::regclass;
-- EXPECTED: one row — anchor_snapshots | true

select polname
from pg_policy
where polrelid = 'public.anchor_snapshots'::regclass;
-- EXPECTED: zero rows.

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'anchor_snapshots'
  and grantee in ('anon', 'authenticated');
-- EXPECTED: zero rows.

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'anchor_snapshots'
  and grantee = 'service_role'
order by privilege_type;
-- EXPECTED (the POSITIVE half of the grants check): rows for at least
-- INSERT, SELECT, UPDATE. If this is EMPTY, the server routes cannot
-- reach the table either — run:
--   grant select, insert, update on table public.anchor_snapshots to service_role;
-- then re-run this query.


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH A POSITIVE CONTROL (§2.9).
-- Run the whole block at once. It ends in ROLLBACK: a test, not a step.
--
-- The editor runs as `postgres`. `set local role` switches the session
-- to each client-facing role for one statement's worth of proof; the
-- insert that must fail is wrapped so it reports instead of aborting.
-- ---------------------------------------------------------------------
begin;

-- POSITIVE CONTROL: the table accepts a well-formed private row (as the
-- service-role routes will write it). If this fails, nothing below means
-- anything — the table is broken, not locked.
insert into public.anchor_snapshots
  (client_id, item_name, item_category, short_description, mode)
values
  ('anon_s2_selftest', 'S2 Self Test Wine', 'wine',
   'Dry and citrus-led. A test row.', 'similar');

select 'POSITIVE CONTROL: row visible to the owner role' as check,
       count(*) = 1 as pass
from public.anchor_snapshots
where client_id = 'anon_s2_selftest';
-- EXPECTED: pass = true

-- The CHECK constraints refuse junk (mode, id length).
do $$
begin
  begin
    insert into public.anchor_snapshots
      (client_id, item_name, item_category, short_description, mode)
    values ('anon_s2_selftest', 'x', 'wine', 'x', 'nonsense');
    raise notice 'FAIL: a junk mode was accepted';
  exception when check_violation then
    raise notice 'PASS: junk mode refused';
  end;
  begin
    insert into public.anchor_snapshots
      (client_id, item_name, item_category, short_description, mode)
    values ('short', 'x', 'wine', 'x', 'similar');
    raise notice 'FAIL: a 5-char client_id was accepted';
  exception when check_violation then
    raise notice 'PASS: short client_id refused';
  end;
end $$;
-- EXPECTED (Messages tab): two PASS notices.

-- anon cannot read, even a row that exists.
set local role anon;
do $$
begin
  begin
    perform 1 from public.anchor_snapshots limit 1;
    raise notice 'FAIL: anon could SELECT anchor_snapshots';
  exception when insufficient_privilege then
    raise notice 'PASS: anon SELECT refused';
  end;
  begin
    insert into public.anchor_snapshots
      (client_id, item_name, item_category, short_description, mode)
    values ('anon_s2_attacker', 'Spam', 'wine', 'Spam.', 'similar');
    raise notice 'FAIL: anon could INSERT into anchor_snapshots';
  exception when insufficient_privilege then
    raise notice 'PASS: anon INSERT refused';
  end;
end $$;
reset role;

-- authenticated cannot either.
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.anchor_snapshots limit 1;
    raise notice 'FAIL: authenticated could SELECT anchor_snapshots';
  exception when insufficient_privilege then
    raise notice 'PASS: authenticated SELECT refused';
  end;
end $$;
reset role;

-- service_role CAN (the positive control for the lock: proving the
-- routes' own role still gets in, so the refusals above are the grant
-- doing its job and not the table being unreachable).
set local role service_role;
select 'POSITIVE CONTROL: service_role reads the test row' as check,
       count(*) = 1 as pass
from public.anchor_snapshots
where client_id = 'anon_s2_selftest';
reset role;
-- EXPECTED: pass = true

rollback;

-- EXPECTED OVERALL: both POSITIVE CONTROL rows pass = true, and five
-- PASS notices (junk mode, short id, anon SELECT, anon INSERT,
-- authenticated SELECT) with zero FAIL notices. Because it rolled back,
-- `select count(*) from public.anchor_snapshots;` afterwards returns 0.


-- ---------------------------------------------------------------------
-- BLOCK 5 — ROLLBACK (only if you need to undo). Safe until S4's panel
-- reads saved items: nothing else references the table.
-- ---------------------------------------------------------------------
-- drop table public.anchor_snapshots;
