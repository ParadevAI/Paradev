# shellcheck shell=bash
# Runs inside the sandbox. Reaches its end only when Claude Code is signed in.
set -euo pipefail
exec 1>&2
claude auth status 2>/dev/null | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    let status = {};
    try { status = JSON.parse(raw); } catch {}
    process.exit(status.loggedIn === true ? 0 : 1);
  });'
