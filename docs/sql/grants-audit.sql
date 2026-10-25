-- Grants + RLS audit for the public schema. READ-ONLY (the session is set
-- read-only on its first line). Run: psql "$SUPABASE_DB_URL" -X -f docs/sql/grants-audit.sql
-- Baseline results: docs/sql/grants-snapshot-2026-10.md
set default_transaction_read_only = on;
\echo '== Q1 grants by table and role (public schema; anon/authenticated/service_role) =='
select c.relname as table_name,
       case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' when 'p' then 'partitioned' when 'f' then 'foreign' end as kind,
       r.rolname as role,
       coalesce(string_agg(p.privilege_type, ',' order by p.privilege_type), '(none)') as privileges
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
cross join (values ('anon'),('authenticated'),('service_role')) as r(rolname)
left join lateral (
  select unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as privilege_type
) p on has_table_privilege(r.rolname, c.oid, p.privilege_type)
where c.relkind in ('r','v','m','p','f')
group by c.relname, c.relkind, r.rolname
order by c.relname, r.rolname;
\echo '== Q2 RLS on/off by table, with policy count =='
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       (select count(*) from pg_policy pol where pol.polrelid = c.oid) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind in ('r','p')
order by c.relname;
\echo '== Q3 policies detail =='
select tablename, policyname, cmd, roles::text, permissive from pg_policies where schemaname='public' order by tablename, policyname;
\echo '== Q4 sequences: role privileges =='
select c.relname as sequence_name, r.rolname as role,
  concat_ws(',', case when has_sequence_privilege(r.rolname,c.oid,'USAGE') then 'USAGE' end,
                 case when has_sequence_privilege(r.rolname,c.oid,'SELECT') then 'SELECT' end,
                 case when has_sequence_privilege(r.rolname,c.oid,'UPDATE') then 'UPDATE' end) as privileges
from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
cross join (values ('anon'),('authenticated'),('service_role')) as r(rolname)
where c.relkind='S' order by 1,2;
\echo '== Q5 default privileges in public =='
select pg_get_userbyid(defaclrole) as owner, defaclobjtype, defaclacl::text from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public' order by 1,2;
\echo '== Q6 functions in public executable by anon (SECURITY DEFINER flagged) =='
select p.proname, p.prosecdef as security_definer, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' order by 1;
