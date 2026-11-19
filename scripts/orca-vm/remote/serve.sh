# shellcheck shell=bash
# Runs inside a new workspace sandbox. Needs ORCA_PORT, ORCA_PROJECT_ROOT,
# ORCA_PAIRING_ADDRESS and ORCA_INSTANCE_ID. Prints the recipe JSON from orca serve.
set -euo pipefail

recipe_file="$HOME/.orca-vm-recipe.json"
serve_log="$HOME/.orca-vm-serve.log"
rm -f "$recipe_file" "$serve_log"
cd "$ORCA_PROJECT_ROOT"
setsid nohup orca-ide serve \
  --port "$ORCA_PORT" \
  --project-root "$ORCA_PROJECT_ROOT" \
  --pairing-address "$ORCA_PAIRING_ADDRESS" \
  --recipe-json >"$recipe_file" 2>"$serve_log" </dev/null &
serve_pid=$!

ready=0
for _ in $(seq 1 240); do
  if node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$recipe_file" >/dev/null 2>&1; then
    ready=1
    break
  fi
  kill -0 "$serve_pid" 2>/dev/null || break
  sleep 0.25
done
if [ "$ready" != 1 ]; then
  cat "$serve_log" >&2
  echo "orca serve did not print its recipe JSON" >&2
  exit 1
fi
cat "$recipe_file"
