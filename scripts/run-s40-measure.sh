#!/usr/bin/env bash
# Session 40 — run docs/sql/2026-11-10_s40-measure.sql block by block (§11.2).
# Backup already taken: backups/2026-11-10-1921-s40.sql (647,228 bytes, footer present).
# Each block stops on the first error (ON_ERROR_STOP); compare each output
# with the EXPECTED lines in the SQL file. Block 4 ends in ROLLBACK.
# Run:  ! bash scripts/run-s40-measure.sh
set -e
cd "F:/Rekomendr/Rekomendr-App"
PSQL="/c/Program Files/PostgreSQL/17/bin/psql"
URL="$(grep -E "^SUPABASE_DB_URL=" .env.local | cut -d= -f2- | tr -d "\"\r")"
TMP="node_modules/.cache/s40-run"
mkdir -p "$TMP"
awk -v D="$TMP" '/^-- BLOCK /{f=D"/block"$3".sql"} f{print > f}' docs/sql/2026-11-10_s40-measure.sql

run() {
  echo; echo "================ BLOCK $1 ================"
  "$PSQL" "$URL" -X -v ON_ERROR_STOP=1 -f "$TMP/block$1.sql" </dev/null
}

# Block 1 must find neither table, or nothing else runs.
out="$("$PSQL" "$URL" -X -At -v ON_ERROR_STOP=1 -c "select coalesce(to_regclass('public.measure_events')::text,'') || '|' || coalesce(to_regclass('public.house_devices')::text,'')" </dev/null)"
echo "BLOCK 1 discovery: '$out' (expected '|')"
if [ "$out" != "|" ]; then echo "STOP: a table already exists. Nothing was run."; exit 1; fi

run 2
run 2b
run 3
run 4
echo; echo "Done. Paste this output back to Claude."
