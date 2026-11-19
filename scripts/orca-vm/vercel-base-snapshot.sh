#!/usr/bin/env bash
# Builds the base image: tools, Claude Code (signed out), the Orca server and a
# clone with a warm bun cache. Paid: one sandbox for the length of the build.
set -euo pipefail
# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_vercel_config

[ -n "$repo_url" ] || die "Set repoUrl in $shared_state"
orca_version="$(env_value ORCA_VM_ORCA_VERSION orcaVersion "")"
[ -n "$orca_version" ] || die "Set orcaVersion in $shared_state to the desktop app's version"
orca_release_url="$(env_value ORCA_VM_ORCA_RELEASE_URL orcaReleaseUrl "")"
orca_server_sha256="$(env_value ORCA_VM_ORCA_SERVER_SHA256 orcaServerSha256 "")"
[ -n "$orca_release_url" ] && [ -n "$orca_server_sha256" ] || die "Set orcaReleaseUrl and orcaServerSha256 in $shared_state"
# A local copy of the server tarball is uploaded instead of downloaded in the sandbox.
orca_tarball="${ORCA_VM_SERVER_TARBALL:-$local_state_dir/orca-server-$orca_version-linux-x64.tar.gz}"
bun_version="$(tr -d '[:space:]' < "$orca_vm_dir/../../.bun-version")"

sandbox_id=""
cleanup() {
  local status=$?
  trap - EXIT
  if [ -n "$sandbox_id" ] && ! stop_sandbox "$sandbox_id"; then
    log "Could not stop $sandbox_id; stop it by hand: vercel sandbox stop $sandbox_id"
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT

sandbox_id="$(create_sandbox)"
log "Building the base image in $sandbox_id"
if [ -f "$orca_tarball" ]; then
  log "Uploading $orca_tarball"
  vercel sandbox copy "$orca_tarball" "$sandbox_id:/home/vercel-sandbox/orca-server.tar.gz" "${vercel_args[@]}" >&2
fi
remote_bash "$sandbox_id" "$orca_vm_dir/remote/base-build.sh" \
  --env "BUN_VERSION=$bun_version" --env "ORCA_VERSION=$orca_version" \
  --env "ORCA_RELEASE_URL=$orca_release_url" --env "ORCA_SERVER_SHA256=$orca_server_sha256" \
  --env "ORCA_REPO_URL=$repo_url" --env "ORCA_REPO_REF=$repo_ref" \
  --env "ORCA_PROJECT_ROOT=$project_root" >&2
remote_bash "$sandbox_id" "$orca_vm_dir/remote/clear-orca-user-data.sh" >&2

snapshot_id="$(snapshot_sandbox "$sandbox_id")"
merge_local_state "$(node -e 'console.log(JSON.stringify({
  baseSnapshotId: process.argv[1], snapshotId: "", authSourceSnapshotId: "", authSandboxId: "",
  orcaVersion: process.argv[2] }))' "$snapshot_id" "$orca_version")"
log "Base snapshot $snapshot_id is ready. Next: ./scripts/orca-vm/vercel-base-auth.sh start"
cat "$local_state"
