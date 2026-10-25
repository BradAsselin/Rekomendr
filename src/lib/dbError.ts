// One name for every Supabase failure on the server (S22, the Oct 30 grants
// change: new public tables get NO default grants for anon, authenticated
// or service_role). A missing grant reads "permission denied for table X"
// (42501). That message names the table too, so the older per-route test
// (code 42P01/PGRST205, or the table's name anywhere in the message) would
// have logged a grants failure as migration_pending. Permission is checked
// first, and it logs as an ERROR: it means a migration shipped without its
// GRANTs, not that the database is slow.

export type DbErrorReason = "permission_denied" | "migration_pending" | "db_error";
type DbError = { code?: string; message?: string } | null | undefined;

export function dbErrorReason(error: DbError): DbErrorReason {
  const code = error?.code ?? "";
  const msg = error?.message ?? "";
  if (code === "42501" || /permission denied/i.test(msg)) return "permission_denied";
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation .* does not exist|schema cache/i.test(msg)
  ) {
    return "migration_pending";
  }
  return "db_error";
}

// For sites that had no log of their own. Returns the reason so the caller
// can surface it (ok:false, reason) instead of answering empty.
export function logDbError(
  where: string,
  error: DbError,
  detail?: Record<string, unknown>
): DbErrorReason {
  const reason = dbErrorReason(error);
  const line = { reason, code: error?.code ?? null, message: error?.message ?? null, ...detail };
  if (reason === "permission_denied") {
    console.error(`[db] PERMISSION DENIED — ${where}: check this table's GRANTs`, line);
  } else {
    console.warn(`[db] ${where} failed`, line);
  }
  return reason;
}
