#!/bin/bash
# Read-only usage audit for the 10x skill.
# Emits one JSON object on stdout; progress and errors go to stderr.
set -u

if ! command -v superset >/dev/null 2>&1; then
  echo "superset CLI not found on PATH; install with: curl -fsSL https://paradev.com/cli/install.sh | sh" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found; run the audit commands by hand as described in SKILL.md" >&2
  exit 1
fi

# Writes a superset command's JSON to $DIR/<key>.json, or null with the error on stderr.
# stdout goes to a file, not a pipe: the CLI can drop output past ~64KB when it
# exits before a slow pipe reader drains it. Files, not --argjson: a large
# account's lists overflow the argument limit.
DIR=$(mktemp -d) || exit 1
trap 'rm -rf "$DIR"' EXIT
run_json() {
  local key=$1 err
  shift
  err=$(mktemp) || { echo null >"$DIR/$key.json"; return; }
  if superset "$@" --json >"$DIR/$key.json" 2>"$err"; then
    if ! jq -e '.' "$DIR/$key.json" >/dev/null 2>&1; then
      echo "invalid JSON from: superset $*" >&2
      echo null >"$DIR/$key.json"
    fi
  else
    echo "failed: superset $* ($(tr '\n' ' ' <"$err"))" >&2
    echo null >"$DIR/$key.json"
  fi
  rm -f "$err"
}

echo "auditing Paradev usage..." >&2
run_json whoami auth whoami
run_json automations automations list
run_json workspaces workspaces list
run_json localWorkspaces workspaces list --local
run_json agents agents list --local
run_json hosts hosts list
run_json tasks tasks list
(unset SUPERSET_WORKSPACE_ID; run_json pages pages list)

args=()
for key in whoami automations workspaces localWorkspaces agents hosts tasks pages; do
  args+=(--slurpfile "$key" "$DIR/$key.json")
done
jq -n "${args[@]}" '{whoami: $whoami[0], automations: $automations[0], workspaces: $workspaces[0], localWorkspaces: $localWorkspaces[0], agents: $agents[0], hosts: $hosts[0], tasks: $tasks[0], pages: $pages[0]}'
