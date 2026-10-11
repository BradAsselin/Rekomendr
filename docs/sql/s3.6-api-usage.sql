-- =====================================================================
-- S3.6 — api_usage (per-client caps on the OpenAI-burning routes)
-- Session 3.6, docs/s3-build-plan.md S3.6, Ledger #19 Calls 1+3.
-- Run block by block (charter §11.2 in local mode; otherwise Brad, in the
-- Supabase SQL editor).
--
-- What this creates: ONE new table, public.api_usage, plus one index.
-- One row per capped request (/api/openai, /api/recipe, /api/reksnap
-- vision + text branches), written by src/lib/apiUsage.ts through the
-- service role. The cap is a count of a client's rows in the last 24h.
--
-- Posture (the anchor_snapshots pattern):
--   * RLS ENABLED, ZERO client policies. Service role only.
--   * REVOKE ALL from anon and authenticated (Data-API grants rule).
--   * No policy joins through another table.
--
-- Nothing existing is altered. Rollback is one line (BLOCK 5). The
-- routes fail OPEN if this table is missing, so dropping it degrades to
-- "uncapped", never to a refusal.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 1 — DISCOVERY (read-only, changes nothing).
-- ---------------------------------------------------------------------
select to_regclass('public.api_usage') as already_exists;

-- EXPECTED: one row, already_exists = NULL.
-- IF IT IS NOT NULL: STOP; do not run BLOCK 2 on top of it.


-- ---------------------------------------------------------------------
-- BLOCK 2 — THE MIGRATION (one transaction: all of it or none of it).
-- ---------------------------------------------------------------------
begin;

create table public.api_usage (
  id bigint generated always as identity primary key,
  client_id text not null check (char_length(client_id) between 8 and 64),
  route text not null check (route in ('openai', 'recipe', 'reksnap-vision', 'reksnap-text')),
  created_at timestamptz not null default now()
);

-- Serves the one query the helper runs: this client, this route, last 24h.
create index api_usage_client_route_created_idx
  on public.api_usage (client_id, route, created_at desc);

alter table public.api_usage enable row level security;
-- Deliberately NO policies.

revoke all on table public.api_usage from anon, authenticated;

commit;

-- EXPECTED: BEGIN / CREATE TABLE / CREATE INDEX / ALTER TABLE / REVOKE / COMMIT


-- ---------------------------------------------------------------------
-- BLOCK 3 — READBACK. Each query states its expected output.
-- ---------------------------------------------------------------------
select relname, relrowsecurity
from pg_class
where oid = 'public.api_usage'::regclass;
-- EXPECTED: one row — api_usage | t

select polname
from pg_policy
where polrelid = 'public.api_usage'::regclass;
-- EXPECTED: zero rows.

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'api_usage'
  and grantee in ('anon', 'authenticated');
-- EXPECTED: zero rows.

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'api_usage'
  and grantee = 'service_role'
  and privilege_type in ('INSERT', 'SELECT')
order by privilege_type;
-- EXPECTED: two rows — service_role | INSERT, service_role | SELECT.
-- IF EMPTY: grant select, insert on table public.api_usage to service_role;


-- ---------------------------------------------------------------------
-- BLOCK 4 — ADVERSARIAL SUITE, WITH A POSITIVE CONTROL (§2.9).
-- Run the whole block at once. It ends in ROLLBACK.
-- ---------------------------------------------------------------------
begin;

-- POSITIVE CONTROL 1: service_role (the helper's role) can insert — the
-- identity column needs no separate sequence grant — and count.
set local role service_role;
insert into public.api_usage (client_id, route) values ('anon_s36_selftest', 'openai');
insert into public.api_usage (client_id, route) values ('anon_s36_selftest', 'openai');
select 'POSITIVE CONTROL: service_role inserts and counts' as check,
       count(*) = 2 as pass
from public.api_usage
where client_id = 'anon_s36_selftest' and route = 'openai'
  and created_at > now() - interval '24 hours';
reset role;
-- EXPECTED: pass = t

-- The CHECK constraints refuse junk (unknown route, short id).
do $$
begin
  begin
    insert into public.api_usage (client_id, route) values ('anon_s36_selftest', 'nonsense');
    raise notice 'FAIL: an unknown route was accepted';
  exception when check_violation then
    raise notice 'PASS: unknown route refused';
  end;
  begin
    insert into public.api_usage (client_id, route) values ('short', 'openai');
    raise notice 'FAIL: a 5-char client_id was accepted';
  exception when check_violation then
    raise notice 'PASS: short client_id refused';
  end;
end $$;
-- EXPECTED: two PASS notices.

-- anon can neither read nor write (a client could otherwise erase or
-- inflate its own counter, or read everyone's request log).
set local role anon;
do $$
begin
  begin
    perform 1 from public.api_usage limit 1;
    raise notice 'FAIL: anon could SELECT api_usage';
  exception when insufficient_privilege then
    raise notice 'PASS: anon SELECT refused';
  end;
  begin
    insert into public.api_usage (client_id, route) values ('anon_s36_attacker', 'openai');
    raise notice 'FAIL: anon could INSERT into api_usage';
  exception when insufficient_privilege then
    raise notice 'PASS: anon INSERT refused';
  end;
  begin
    delete from public.api_usage where client_id = 'anon_s36_selftest';
    raise notice 'FAIL: anon could DELETE from api_usage';
  exception when insufficient_privilege then
    raise notice 'PASS: anon DELETE refused';
  end;
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin
    perform 1 from public.api_usage limit 1;
    raise notice 'FAIL: authenticated could SELECT api_usage';
  exception when insufficient_privilege then
    raise notice 'PASS: authenticated SELECT refused';
  end;
end $$;
reset role;

-- POSITIVE CONTROL 2: after the refusals, the self-test rows are intact
-- (the anon DELETE really did nothing).
select 'POSITIVE CONTROL: self-test rows survive the attacks' as check,
       count(*) = 2 as pass
from public.api_usage
where client_id = 'anon_s36_selftest';
-- EXPECTED: pass = t

rollback;

-- EXPECTED OVERALL: both POSITIVE CONTROL rows pass = t, six PASS notices
-- (unknown route, short id, anon SELECT, anon INSERT, anon DELETE,
-- authenticated SELECT), zero FAIL. Afterwards
-- `select count(*) from public.api_usage;` returns 0.


-- ---------------------------------------------------------------------
-- BLOCK 5 — ROLLBACK (only if you need to undo). The routes fail open
-- without the table: uncapped, never refusing.
-- ---------------------------------------------------------------------
-- drop table public.api_usage;
