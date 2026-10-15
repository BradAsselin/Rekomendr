-- =====================================================================
-- S4 — THE TEST READOUT (docs/s4-s5-build-plan.md). READ-ONLY.
-- Paste into the Supabase SQL editor and run. Change the start date on
-- the first line of the CTE to the day S4 reached production.
--
-- Primary metric: receivers who go on to send a card of their own.
-- The same definitions are computed by /api/stats (src/lib/testReadout.ts)
-- — if the two ever disagree, this file is the reference.
--
-- Definitions
--   sender         — a client that sent ≥1 card (event 'sent').
--   receiver       — a client that opened ≥1 card someone ELSE sent
--                    (event 'open', is_sender = false). Link scrapers run
--                    no script, so a preview is never an open.
--   reopen rate    — receiver opens more than 2 days after the card was
--                    sent ÷ all receiver opens. ("The card lives in the
--                    thread and gets tapped again weeks later.")
--   conversion     — receivers whose FIRST own send came after opening
--                    someone else's card (via_card set) ÷ receivers.
--   installs       — clients with ≥1 standalone (home-screen) launch.
-- Agent test traffic (client ids starting anon_agent) is excluded.
-- =====================================================================

with params as (
  select timestamptz '2026-10-15 00:00:00+00' as test_start
),
ev as (
  select e.*
  from public.card_events e, params p
  where e.created_at >= p.test_start
    and e.client_id not like 'anon_agent%'
),
receiver_opens as (
  select * from ev where kind = 'open' and is_sender = false
),
receivers as (
  select distinct client_id from receiver_opens
),
converted as (
  select distinct client_id from ev where kind = 'sent' and via_card is not null
)
select
  (select count(distinct card_id) from ev where kind = 'sent')                as cards_sent,
  (select count(*) from ev where kind = 'sent')                               as sends,
  (select count(distinct client_id) from ev where kind = 'sent')              as senders,
  (select count(*) from receivers)                                            as unique_receivers,
  (select count(*) from receiver_opens)                                       as receiver_opens,
  (select count(*) from receiver_opens where since_send_s > 2 * 86400)        as late_opens,
  round(100.0 * (select count(*) from receiver_opens where since_send_s > 2 * 86400)
        / nullif((select count(*) from receiver_opens), 0), 1)                as reopen_rate_pct,
  (select count(*) from converted)                                            as receivers_who_sent,
  round(100.0 * (select count(*) from converted)
        / nullif((select count(*) from receivers), 0), 1)                     as receiver_to_sender_pct,
  (select count(*) from ev where kind = 'tap_watch')                          as watch_taps,
  (select count(*) from ev where kind = 'tap_trailer')                        as trailer_taps,
  (select count(*) from ev where kind = 'tap_buy')                            as buy_taps,
  (select count(*) from ev where kind = 'save')                               as saves,
  (select count(distinct client_id) from ev where kind = 'standalone_launch') as installs;

-- EXPECTED: one row of counts. Before any traffic: every count 0 and the
-- two percentages NULL (nothing to divide by yet).


-- ---------------------------------------------------------------------
-- Which cards bring people in (receiver → sender, by entry card).
-- ---------------------------------------------------------------------
-- with params as (select timestamptz '2026-10-15 00:00:00+00' as test_start)
-- select e.via_card, s.item_name, s.sender_name, count(*) as new_senders
-- from public.card_events e
-- join public.anchor_snapshots s on s.id = e.via_card, params p
-- where e.kind = 'sent' and e.via_card is not null
--   and e.created_at >= p.test_start and e.client_id not like 'anon_agent%'
-- group by 1, 2, 3
-- order by new_senders desc;
