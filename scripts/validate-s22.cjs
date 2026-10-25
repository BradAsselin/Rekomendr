// S22 — grants audit + loud DB failures. node scripts/validate-s22.cjs
// Static + unit checks only (no network, no database).
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const ts = require(path.join(root, "node_modules/typescript"));

let pass = 0;
let fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const load = (p) => {
  const out = ts.transpileModule(read(p), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
};

console.log("— the classifier (src/lib/dbError.ts)");
const D = load("src/lib/dbError.ts");
// Real production error shapes (2026-10-25, anon SELECT on tables with no
// anon grant, and a missing table).
check("42501 'permission denied for table wine_marks' → permission_denied",
  D.dbErrorReason({ code: "42501", message: "permission denied for table wine_marks" }), "permission_denied");
check("permission text without a code → permission_denied",
  D.dbErrorReason({ message: "permission denied for sequence card_events_id_seq" }), "permission_denied");
check("PGRST205 (schema cache) → migration_pending", D.dbErrorReason({ code: "PGRST205", message: "Could not find the table 'public.x' in the schema cache" }), "migration_pending");
check("42P01 → migration_pending", D.dbErrorReason({ code: "42P01", message: 'relation "public.x" does not exist' }), "migration_pending");
check("anything else → db_error", D.dbErrorReason({ code: "57014", message: "canceling statement due to statement timeout" }), "db_error");
check("null → db_error", D.dbErrorReason(null), "db_error");
const errs = [];
const warns = [];
const ce = console.error;
const cw = console.warn;
console.error = (...a) => errs.push(a);
console.warn = (...a) => warns.push(a);
const r1 = D.logDbError("t", { code: "42501", message: "permission denied for table go_tos" });
const r2 = D.logDbError("t", { code: "57014", message: "timeout" });
console.error = ce;
console.warn = cw;
check("logDbError: permission denied logs as an ERROR", [r1, errs.length], ["permission_denied", 1]);
check("logDbError: other failures log as a warning", [r2, warns.length], ["db_error", 1]);

console.log("— no route classifies by table name in the message");
const files = [
  "app/api/gotos/route.ts", "app/api/wine/route.ts", "app/api/mood/route.ts", "app/api/voice/route.ts",
  "src/lib/apiUsage.ts", "src/lib/anchorSnapshots.ts",
];
for (const f of files) {
  check(`${f}: no /table/.test(error.message) classifier`, /\/[a-z_|]+\/\.test\((\w+\.)?error\.message/.test(read(f)) || /\/[a-z_|]+\/\.test\(msg\)/.test(read(f)), false);
}
check("anchorSnapshots.reasonForDbError delegates to dbErrorReason", /const reason = dbErrorReason\(error\)/.test(read("src/lib/anchorSnapshots.ts")), true);
check("gotos + wine failure() go through logDbError",
  /logDbError\(`go-tos \$\{where\}`/.test(read("app/api/gotos/route.ts")) && /logDbError\(`wine-marks \$\{where\}`/.test(read("app/api/wine/route.ts")), true);

console.log("— reads that answered empty with no log now log");
const rek = read("app/api/reksnap/route.ts");
check("reksnap prior-dislikes read logs its error", /logDbError\("reksnap prior dislikes read", error\)/.test(rek), true);
check("reksnap wine-dislikes read logs its error", /logDbError\("reksnap wine dislikes read", error\)/.test(rek), true);
check("no `if (error || !Array.isArray(data)) return` left in reksnap", /if \(error \|\| !Array\.isArray\(data\)\) return/.test(rek), false);
check("save: the long-tier enrich update is checked", /if \(enriched\.error\) logDbError/.test(read("app/api/save/route.ts")), true);
check("prefs: a failed read answers ok:false + reason", /\{ \.\.\.EMPTY_PREFS, ok: false, reason \}/.test(read("app/api/prefs/route.ts")), true);
const up = read("src/lib/userPrefs.ts");
check("like write checks its result (S23: via /api/signals)", /fetch\('\/api\/signals'/.test(up) && /\[user-likes\] write failed/.test(up), true);
check("prefs client logs ok:false", /data\?\.ok === false\) console\.warn\('\[prefs\] read failed'/.test(up), true);
check("profile + cardEvents name the reason (no hard-coded db_error)",
  !/refuse\("db_error"/.test(read("app/api/profile/route.ts")) && !/notRecorded\(kind, "db_error"/.test(read("src/lib/cardEvents.ts")), true);

console.log("— the record");
const snap = read("docs/sql/grants-snapshot-2026-10.md");
check("grants snapshot has both audit queries and their results", /Q1/.test(snap) && /Q2/.test(snap) && /reksnap_signals/.test(snap) && /rls_enabled/.test(snap), true);
check("grants snapshot carries no secrets", /(service_role_key|eyJ[A-Za-z0-9_-]{20,}|postgres(ql)?:\/\/[^\s`]*@)/i.test(snap), false);
const charter = read("docs/BUILD_CHARTER.md");
check("charter §11.2 carries the grants rule", /11\.2a/.test(charter) && /never use `alter default privileges`/i.test(charter), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
