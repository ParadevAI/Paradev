#!/usr/bin/env bash
# Orca recipe `create`: boots one sandbox from the signed-in snapshot, hands it
# the primary checkout's .env and a Git token, starts `orca serve`, and prints
# the recipe result.
set -euo pipefail
# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_vercel_config

snapshot_id="$(env_value ORCA_VM_SNAPSHOT_ID snapshotId "")"
[ -n "$snapshot_id" ] ||
  die "No signed-in snapshot on this machine. Run vercel-base-snapshot.sh, then vercel-base-auth.sh (see scripts/orca-vm/README.md)"

primary_checkout="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
env_file="${ORCA_VM_ROOT_ENV_FILE:-$primary_checkout/.env}"
[ -f "$env_file" ] || die "Root .env not found at $env_file"

git_token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$git_token" ] && command -v gh >/dev/null 2>&1; then
  git_token="$(gh auth token 2>/dev/null || true)"
fi
[ -n "$git_token" ] || log "No Git token found; the workspace can fetch but not push"

instance_id="${ORCA_VM_INSTANCE_ID:-manual-$(date +%s)}"
instance_record="$instances_dir/$instance_id"
mkdir -p "$instances_dir"
if [ -f "$instance_record" ]; then
  stop_sandbox "$(cat "$instance_record")" || true
  rm -f "$instance_record"
fi

sandbox_id=""
cleanup_on_error() {
  local status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ -n "$sandbox_id" ]; then
    stop_sandbox "$sandbox_id" && rm -f "$instance_record"
  fi
  exit "$status"
}
trap cleanup_on_error EXIT

sandbox_id="$(create_sandbox --snapshot "$snapshot_id")"
printf '%s' "$sandbox_id" > "$instance_record"
public_url="$(sed -nE 's#.*(https://[^[:space:]]+\.vercel\.run).*#\1#p' "$create_log" | head -1)"
rm -f "$create_log"
[ -n "$public_url" ] || die "No published URL in the create output"

vercel sandbox exec "$sandbox_id" "${vercel_args[@]}" -- mkdir -p "$remote_env_dir" >&2
vercel sandbox copy "$env_file" "$sandbox_id:$remote_env_dir/.env" "${vercel_args[@]}" >/dev/null 2>&1 ||
  die "Could not copy the root .env into $sandbox_id"

prepare_env=(--env "ORCA_PROJECT_ROOT=$project_root" --env "ORCA_REPO_REF=$repo_ref"
  --env "GIT_USER_NAME=$(git config user.name || true)" --env "GIT_USER_EMAIL=$(git config user.email || true)")
[ -z "$git_token" ] || prepare_env+=(--env "ORCA_GIT_TOKEN=$git_token")
remote_bash "$sandbox_id" "$orca_vm_dir/remote/prepare.sh" "${prepare_env[@]}" >&2

recipe_json="$(remote_bash "$sandbox_id" "$orca_vm_dir/remote/serve.sh" \
  --env "ORCA_PORT=$port" --env "ORCA_PROJECT_ROOT=$project_root" \
  --env "ORCA_PAIRING_ADDRESS=${public_url/https:\/\//wss://}" --env "ORCA_INSTANCE_ID=$instance_id")"

node -e '
  const [recipe, resourceId, snapshotId] = process.argv.slice(1);
  const result = JSON.parse(recipe);
  console.log(JSON.stringify({
    ...result,
    schemaVersion: 1,
    userData: { ...result.userData, provider: "vercel-sandbox", resourceId, snapshotId },
  }));' "$recipe_json" "$sandbox_id" "$snapshot_id"
trap - EXIT
