#!/usr/bin/env bash
# Session 39 — run the approved test-row DELETE (docs/sql/2026-11-10_s39-delete-test-rows.sql).
# One transaction; any count mismatch rolls everything back. Backup: backups/2026-11-10-1221-s39.sql.
# Run:  ! bash scripts/run-s39-delete.sh
cd "F:/Rekomendr/Rekomendr-App" && "/c/Program Files/PostgreSQL/17/bin/psql" "$(grep -E "^SUPABASE_DB_URL=" .env.local | cut -d= -f2- | tr -d "\"\r")" -X -f docs/sql/2026-11-10_s39-delete-test-rows.sql
