#!/usr/bin/env bash
# Session 41 — run docs/sql/2026-11-22_s41-get-app-counts.sql block by block (§11.2).
# Takes the backup first (backups/YYYY-MM-DD-HHMM-s41.sql) and stops if it is
# empty or has no dump-complete footer. Each block stops on the first error
# (ON_ERROR_STOP); compare each output with the EXPECTED lines in the SQL
# file. Block 4 ends in ROLLBACK.
# Run:  ! bash scripts/run-s41-get-app-counts.sh
set -e
cd "F:/Rekomendr/Rekomendr-App"
BIN="/c/Program Files/PostgreSQL/17/bin"
URL="$(grep -E "^SUPABASE_DB_URL=" .env.local | cut -d= -f2- | tr -d "\"\r")"
TMP="node_modules/.cache/s41-run"
mkdir -p "$TMP" backups
awk -v D="$TMP" '/^-- BLOCK /{f=D"/block"$3".sql"} f{print > f}' docs/sql/2026-11-22_s41-get-app-counts.sql

BACKUP="${S41_BACKUP:-backups/$(date +%Y-%m-%d-%H%M)-s41.sql}"
if [ ! -s "$BACKUP" ]; then
  echo "Taking the backup: $BACKUP"
  "$BIN/pg_dump" "$URL" --no-owner --no-privileges -f "$BACKUP" </dev/null
fi
SIZE=$(wc -c < "$BACKUP")
if [ "$SIZE" -le 0 ] || ! grep -q "PostgreSQL database dump complete" "$BACKUP"; then
  echo "STOP: the backup $BACKUP is empty or incomplete. Nothing was run."; exit 1
fi
echo "Backup: $BACKUP ($SIZE bytes, dump-complete footer present)"

run() {
  echo; echo "================ BLOCK $1 ================"
  "$BIN/psql" "$URL" -X -v ON_ERROR_STOP=1 -f "$TMP/block$1.sql" </dev/null
}

# Block 1 must find the kind check, or nothing else runs.
out="$("$BIN/psql" "$URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_constraint where conrelid = 'public.measure_events'::regclass and conname = 'measure_events_kind_check'" </dev/null)"
echo "BLOCK 1 discovery: '$out' (expected '1')"
if [ "$out" != "1" ]; then echo "STOP: measure_events_kind_check is not there. Nothing was run."; exit 1; fi

run 2
run 3
run 4
echo; echo "Done. Paste this output back to Claude."
