// S23 — browser writes moved server-side + grants tightened.
// node scripts/validate-s23-grants.cjs  (static checks; no network, no database)
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let pass = 0;
let fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const walk = (dir) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) => {
    const p = `${dir}/${d.name}`;
    if (d.isDirectory()) return d.name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });

console.log("— no table access from the browser");
const browserClientUsers = [...walk("src"), ...walk("app")].filter((f) => /supabaseClient/.test(read(f)) && !/^src\/lib\/supabaseClient\.ts$/.test(f));
check("only auth uses the browser Supabase client", browserClientUsers.sort(), ["src/components/AuthControl.tsx", "src/lib/auth.ts"]);
check("…and it only calls supabase.auth", browserClientUsers.every((f) => !/supabase\.(from|rpc|storage)\b/.test(read(f))), true);
check("tokenManager (dead, browser write to a missing table) is gone", fs.existsSync(path.join(root, "src/lib/tokenManager.ts")), false);

console.log("— the writers post to /api/signals");
const up = read("src/lib/userPrefs.ts");
const rs = read("src/lib/reksnapSignals.ts");
check("recordLike → /api/signals kind like, keepalive", /fetch\('\/api\/signals'/.test(up) && /kind: 'like'/.test(up) && /keepalive: true/.test(up), true);
check("recordLike notifies Saved only after a confirmed write", /if \(!res\?\.ok \|\| !data\?\.ok\) \{[\s\S]*?return;\s*\}\s*if \(params\.action === 'save'/.test(up), true);
check("recordSnapSignal → /api/signals kind snap, keepalive", /fetch\('\/api\/signals'/.test(rs) && /kind: 'snap'/.test(rs) && /keepalive: true/.test(rs), true);
check("both log a failed write as an error", /console\.error\('\[user-likes\] write failed'/.test(up) && /console\.error\('\[reksnapSignals\] write failed'/.test(rs), true);

console.log("— the route");
const route = read("app/api/signals/route.ts");
check("rate cap + client-id check (capGate, key signals)", /await capGate\(body\?\.clientId, "signals"\)/.test(route), true);
check("cap key exists", /signals: 2000/.test(read("src/lib/apiUsage.ts")), true);
const set = (name) => (route.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`)) || [, ""])[1].match(/"[^"]+"/g)?.map((s) => s.slice(1, -1)) ?? [];
check("like actions = user_likes CHECK minus watched", set("LIKE_ACTIONS"), ["like", "dislike", "save", "more_like_this"]);
check("snap actions = reksnap_signals CHECK", set("SNAP_ACTIONS"), ["like", "dislike", "save", "context_flip", "detail_expand", "chain", "anchor_reroll"]);
check("source is fixed server-side", /source: "reksnap"/.test(route) && !/body\.source/.test(route), true);
check("action-owned columns NULL otherwise", /action === "context_flip" &&/.test(route) && /action === "chain" &&/.test(route), true);
check("insert failures are named (logDbError)", /logDbError\(`signals \$\{body\.kind\} insert`/.test(route), true);
check("service-role store, never imported statically", /getSnapshotStore/.test(route) && !/supabaseServer/.test(route), true);

console.log("— the migration");
const sql = read("docs/sql/s23-grants-tighten.sql");
check("§11.2 shape: discovery, migration, readback, adversarial", ["BLOCK 1", "BLOCK 2", "BLOCK 3", "BLOCK 4"].every((b) => sql.includes(b)), true);
check("widens api_usage.route with signals", /'reksnap-text', 'signals'\)\)/.test(sql), true);
check("account_devices: revoke all from anon, authenticated", /revoke all on table public\.account_devices from anon, authenticated;/.test(sql), true);
check("identity sequences revoked from public roles", /revoke all on sequence[\s\S]*?from anon, authenticated;/.test(sql), true);
check("never restores blanket grants", /^\s*alter default privileges/im.test(sql), false);
check("INSERT revoke is STAGED (commented) until promotion", /^-- revoke insert on table public\.user_likes, public\.reksnap_signals from anon, authenticated;/m.test(sql) && !/^revoke insert/m.test(sql), true);
check("adversarial block ends in ROLLBACK", /BLOCK 4[\s\S]*?\nrollback;/.test(sql), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
