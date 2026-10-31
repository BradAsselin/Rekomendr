/* Windows preload for the harnesses that spawn `npx` without a shell
 * (spawnSync npx ENOENT). Run: node -r ./scripts/npx-shim.cjs scripts/validate-X.cjs
 * Committed in S28c (the session log asked for it several times). */
if (process.platform === "win32") {
  const cp = require("child_process");
  for (const name of ["spawnSync", "spawn", "execFileSync", "execFile"]) {
    const orig = cp[name];
    cp[name] = function (cmd, args, opts) {
      if (cmd === "npx" || cmd === "npm") {
        if (Array.isArray(args)) return orig.call(this, cmd, args, { ...(opts || {}), shell: true });
        return orig.call(this, cmd, { ...(args || {}), shell: true });
      }
      return orig.apply(this, arguments);
    };
  }
}
