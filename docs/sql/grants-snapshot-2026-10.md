# Grants + RLS snapshot — production, 2026-10-25

The baseline before Supabase's Oct 30, 2026 change: new tables in `public` get no default grants for `anon`, `authenticated` or `service_role`.

- **Project:** `zbkwlilrjdbnmgavcdmp` (production; `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_DB_URL` all point at this project).
- **How it was run:** `psql "$SUPABASE_DB_URL" -X -f docs/sql/grants-audit.sql`, in a session set to `default_transaction_read_only = on`.
- **Changes made:** none. No DDL, no DML, no grants changed.
- **Rule this baseline serves:** BUILD_CHARTER §11.2a.

Privileges are effective (`has_table_privilege`), so they include anything inherited.

## Q1 — grants by table and role

| table | anon | authenticated | service_role |
|---|---|---|---|
| account_devices | **ALL** (S I U D T R Tr) | **ALL** | ALL |
| anchor_snapshots | none | none | ALL |
| api_usage | none | none | ALL |
| card_events | none | none | ALL |
| client_profiles | none | none | ALL |
| go_tos | none | none | ALL |
| goto_events | none | none | ALL |
| reksnap_signals | **ALL** | **ALL** | ALL |
| user_likes | **ALL** | **ALL** | ALL |
| voice_events | none | none | ALL |
| voice_moods | none | none | ALL |
| wine_marks | none | none | ALL |

ALL = SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER. There are no views, materialized views or foreign tables in `public`.

## Q2 — RLS by table

| table | rls_enabled | forced | policies |
|---|---|---|---|
| account_devices | t | f | 1 |
| anchor_snapshots | t | f | 0 |
| api_usage | t | f | 0 |
| card_events | t | f | 0 |
| client_profiles | t | f | 0 |
| go_tos | t | f | 0 |
| goto_events | t | f | 0 |
| reksnap_signals | t | f | 1 |
| user_likes | t | f | 2 |
| voice_events | t | f | 0 |
| voice_moods | t | f | 0 |
| wine_marks | t | f | 0 |

## Q3 — policies

| table | policy | cmd | roles | rule |
|---|---|---|---|---|
| account_devices | authenticated read own devices | SELECT | authenticated | `user_id = auth.uid()` |
| reksnap_signals | Allow anon insert | INSERT | anon, authenticated | check: client_id is 8 to 64 chars and `source = 'reksnap'` |
| user_likes | anon insert | INSERT | anon, authenticated | check: `true` |
| user_likes | authenticated select own rows | SELECT | authenticated | `client_id` is in the caller's `account_devices` |

## Q4 — sequences

All five sequences back identity columns: `api_usage`, `card_events`, `goto_events`, `user_likes` and `voice_events`. The other id columns are `gen_random_uuid()`.

| sequence | anon | authenticated | service_role |
|---|---|---|---|
| api_usage_id_seq | USAGE, SELECT, UPDATE | same | same |
| card_events_id_seq | USAGE, SELECT, UPDATE | same | same |
| goto_events_id_seq | USAGE, SELECT, UPDATE | same | same |
| user_likes_id_seq | USAGE, SELECT, UPDATE | same | same |
| voice_events_id_seq | USAGE, SELECT, UPDATE | same | same |

## Q5 — default privileges in `public` (the pre-Oct-30 behavior)

For both `postgres` and `supabase_admin`, new tables (`r`), sequences (`S`) and functions (`f`) are auto-granted in full to `anon`, `authenticated` and `service_role`. Supabase's Oct 30 change is what turns this off. §11.2a forbids turning it back on.

## Q6 — functions in `public`

None.

---

## Flags

### Anon can write: 3 tables
`account_devices`, `reksnap_signals` and `user_likes` give `anon` and `authenticated` INSERT, UPDATE, DELETE and TRUNCATE. What anon can actually do through the Data API (PostgREST, anon key):

| table | anon INSERT | anon UPDATE / DELETE | TRUNCATE grant | needed by the app |
|---|---|---|---|---|
| reksnap_signals | **yes**, by policy (client_id length + `source='reksnap'`) | blocked by RLS (no policy) | held; RLS does not govern TRUNCATE, and PostgREST does not expose it | INSERT only (browser `recordSignal`) |
| user_likes | **yes**, by policy with `with_check true` (any client_id, any action value the CHECK allows) | blocked by RLS | held, same note | INSERT only (browser `recordLike`); authenticated SELECT by policy |
| account_devices | blocked by RLS (no anon policy) | blocked by RLS | held, same note | none for anon; authenticated SELECT own rows; writes are server-only (`/api/auth/merge`) |

The two INSERTs are by design (S2a): the browser writes signals directly. Everything else on these three tables is a dormant grant. RLS blocks it today, but it is one bad policy away from live, and TRUNCATE sits outside RLS entirely.

`user_likes`' anon insert policy checks nothing (`true`). Unlike `reksnap_signals`, it doesn't even bound `client_id`. This was already true; noted, not new.

### RLS off while anon/authenticated hold grants: none
All 12 tables have RLS on. The nine server-only tables also hold no anon/authenticated grants at all, so they have zero policies and zero grants (belt and suspenders).

### Other observations
- **Sequences:** anon and authenticated hold USAGE, SELECT and UPDATE on all five sequences, including the four behind server-only tables. UPDATE allows `setval`. PostgREST doesn't expose it, so it's dormant. Identity columns don't need sequence grants for INSERT, so none of the five needs anon/authenticated access at all.
- **RLS denial is silent.** Measured 2026-10-25: an anon SELECT on `user_likes` (grant held, no anon SELECT policy) returns 0 rows and **no error**. A missing grant does error (42501 `permission denied for table …`; measured on anchor_snapshots, wine_marks, go_tos and api_usage). Server routes use `service_role`, which has BYPASSRLS, so this only matters for future browser or signed-in reads. A read that RLS filters can never be told apart from "no data".
- **service_role** holds ALL on every table, including TRUNCATE, REFERENCES and TRIGGER. That's more than §11.2a asks of new tables. It's harmless for existing tables and left as is.

---

## Proposed tightening — NOT RUN (needs Brad's approval)

Drafted only. Running it goes through §11.2: backup first, block by block, readback, adversarial suite, logged.

```sql
-- Block 1 — reksnap_signals: browser keeps INSERT only (S2a write-only).
revoke select, update, delete, truncate, references, trigger
  on table public.reksnap_signals from anon, authenticated;

-- Block 2 — user_likes: browser keeps INSERT; signed-in keeps SELECT (policy).
revoke select, update, delete, truncate, references, trigger
  on table public.user_likes from anon;
revoke update, delete, truncate, references, trigger
  on table public.user_likes from authenticated;

-- Block 3 — account_devices: server-only writes; signed-in reads own rows.
revoke all on table public.account_devices from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.account_devices from authenticated;

-- Block 4 — identity sequences need no public-role grants.
revoke all on sequence public.api_usage_id_seq, public.card_events_id_seq,
  public.goto_events_id_seq, public.user_likes_id_seq, public.voice_events_id_seq
  from anon, authenticated;
```

Before running it, check that:
- browser inserts don't ask for a returning row (`recordSignal` and `recordLike` call `.insert()` without `.select()`, so no SELECT is needed);
- the `user_likes` select policy's subquery on `account_devices` still works for `authenticated` (it keeps SELECT there).

After running it, prove each grant through the app's own paths: a snap thumbs-down, a like, the Saved page, a sign-in merge. Then run the adversarial suite.

---

## AFTER S23 — 2026-10-25 (migration `docs/sql/s23-grants-tighten.sql`, backup `backups/2026-10-25-1534-s23.sql`)

The tightening ran under §11.2:
- discovery matched this baseline;
- Block 2 committed;
- every readback matched EXPECTED;
- the adversarial suite passed, with 2 positive controls and 17 of 17 refusals, then ROLLBACK.

| table | anon | authenticated | service_role |
|---|---|---|---|
| account_devices | none | none | ALL |
| reksnap_signals | INSERT (staged to go; see below) | INSERT (staged) | ALL |
| user_likes | INSERT (staged) | INSERT (staged) | ALL |
| the other 9 tables | none | none | ALL |
| 5 identity sequences | none | none | unchanged |

- `api_usage.route` CHECK widened with `'signals'` (the `/api/signals` cap key).
- The policies are unchanged. The "authenticated select own rows" policy on user_likes and the "authenticated read own devices" policy on account_devices are now dormant (no grant behind them).
- RLS is still on for all 12 tables.

**Staged (Block 5):** revoke INSERT on user_likes and reksnap_signals from anon and authenticated. Production (release/v2) still writes those from the browser until S23 is promoted, and preview and production share this database. Run Block 5 right after promotion. After that, the public roles hold nothing on any table.
