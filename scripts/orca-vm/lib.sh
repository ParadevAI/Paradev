#!/usr/bin/env bash
# Shared by the vercel-*.sh scripts. Stdout is reserved for each script's JSON result.

orca_vm_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
shared_state="$orca_vm_dir/vercel-state.json"
# Snapshot ids hold one person's agent sign-in, so they stay on that person's machine.
local_state_dir="${ORCA_VM_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/paradev-orca-vm}"
local_state="$local_state_dir/vercel-state.local.json"
instances_dir="$local_state_dir/instances"
remote_env_dir="/home/vercel-sandbox/.orca-vm-env"

log() { printf '%s\n' "$*" >&2; }
die() { log "$*"; exit 1; }

json_value() {
  node -e '
    const fs = require("node:fs");
    const [key, ...files] = process.argv.slice(1);
    for (const file of files) {
      let value;
      try { value = JSON.parse(fs.readFileSync(file, "utf8"))[key]; } catch { continue; }
      if (value !== undefined && value !== null && value !== "") {
        process.stdout.write(String(value));
        break;
      }
    }' "$1" "$local_state" "$shared_state"
}

# env_value ENV_NAME state_key fallback
env_value() {
  local value="${!1:-}"
  [ -n "$value" ] || value="$(json_value "$2")"
  printf '%s' "${value:-$3}"
}

# merge_local_state '{"key":"value"}' — an empty string removes the key.
merge_local_state() {
  mkdir -p "$local_state_dir"
  node -e '
    const fs = require("node:fs");
    const [file, patch] = process.argv.slice(1);
    let state = {};
    try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    for (const [key, value] of Object.entries(JSON.parse(patch))) {
      if (value === "") delete state[key]; else state[key] = value;
    }
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");' "$local_state" "$1"
}

load_vercel_config() {
  command -v vercel >/dev/null 2>&1 || die "vercel CLI not found on PATH"
  command -v node >/dev/null 2>&1 || die "node not found on PATH"
  scope="$(env_value ORCA_VM_SCOPE scope "")"
  project="$(env_value ORCA_VM_PROJECT project "")"
  port="$(env_value ORCA_VM_PORT port 6768)"
  vcpus="$(env_value ORCA_VM_VCPUS vcpus 4)"
  timeout="$(env_value ORCA_VM_TIMEOUT timeout 45m)"
  snapshot_expiration="$(env_value ORCA_VM_SNAPSHOT_EXPIRATION snapshotExpiration 30d)"
  repo_url="$(env_value ORCA_VM_REPO_URL repoUrl "")"
  repo_ref="$(env_value ORCA_VM_REPO_REF repoRef main)"
  project_root="$(env_value ORCA_VM_PROJECT_ROOT projectRoot /vercel/sandbox/paradev)"
  [ -n "$scope" ] && [ -n "$project" ] || die "Set scope and project in $shared_state"
  vercel_args=(--scope "$scope" --project "$project")
  create_log="$(mktemp)"
}

# Prints the new sandbox id. The published URL lands in $create_log, which the
# caller sets because this runs in a command substitution.
create_sandbox() {
  local id
  if ! id="$(vercel sandbox create --timeout "$timeout" --vcpus "$vcpus" --publish-port "$port" \
      "$@" "${vercel_args[@]}" 2>"$create_log")"; then
    cat "$create_log" >&2
    return 1
  fi
  cat "$create_log" >&2
  case "$id" in
    sbx_*) printf '%s' "$id" ;;
    *) log "No sandbox id in the create output: $id"; return 1 ;;
  esac
}

stop_sandbox() {
  vercel sandbox stop "$1" "${vercel_args[@]}" >&2
}

# remote_bash SANDBOX_ID SCRIPT_FILE [--env KEY=VALUE ...]
# `vercel sandbox exec` exits 0 whatever the remote command does, so the script
# proves it finished by printing a last line that only a full run reaches.
remote_bash() {
  local id="$1" script_file="$2" out
  shift 2
  out="$(vercel sandbox exec "$id" "${vercel_args[@]}" "$@" -- \
    bash -lc 'exec 3>&1'$'\n'"$(cat "$script_file")"$'\n''echo ORCA_VM_REMOTE_OK >&3')" || return 1
  case "$out" in
    *ORCA_VM_REMOTE_OK) printf '%s' "${out%ORCA_VM_REMOTE_OK}" ;;
    *) printf '%s\n' "$out" >&2; log "Remote step failed: $(basename "$script_file")"; return 1 ;;
  esac
}

# Prints the snapshot id and stops the sandbox.
snapshot_sandbox() {
  local out id
  out="$(vercel sandbox snapshot "$1" --stop --expiration "$snapshot_expiration" "${vercel_args[@]}" 2>&1)" || {
    printf '%s\n' "$out" >&2
    return 1
  }
  printf '%s\n' "$out" >&2
  id="$(printf '%s\n' "$out" | sed -nE 's/.*(snap_[A-Za-z0-9]+).*/\1/p' | tail -1)"
  [ -n "$id" ] || { log "No snapshot id in the snapshot output"; return 1; }
  printf '%s' "$id"
}
