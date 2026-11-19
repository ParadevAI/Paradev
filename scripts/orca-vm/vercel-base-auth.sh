#!/usr/bin/env bash
# Signs Claude Code in on top of the base image and snapshots the result.
#   start   boot a sandbox from the base snapshot and print the sign-in command
#   finish  check the sign-in, snapshot, and record the snapshot for create
#   abort   stop the sign-in sandbox
# Paid: one sandbox from start until finish, abort or its timeout.
set -euo pipefail
# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_vercel_config

base_snapshot_id="$(env_value ORCA_VM_BASE_SNAPSHOT_ID baseSnapshotId "")"
auth_sandbox_id="$(json_value authSandboxId)"

case "${1:-}" in
  start)
    [ -n "$base_snapshot_id" ] || die "No base snapshot. Run ./scripts/orca-vm/vercel-base-snapshot.sh first"
    [ -z "$auth_sandbox_id" ] || die "Sign-in sandbox $auth_sandbox_id is already recorded; run finish or abort"
    auth_sandbox_id="$(create_sandbox --snapshot "$base_snapshot_id")"
    merge_local_state "$(node -e 'console.log(JSON.stringify({ authSandboxId: process.argv[1] }))' "$auth_sandbox_id")"
    log "Sign in from your own terminal, then run: ./scripts/orca-vm/vercel-base-auth.sh finish"
    log "  vercel sandbox exec --interactive --tty $auth_sandbox_id ${vercel_args[*]} -- bash -lc 'claude auth login'"
    ;;
  finish)
    [ -n "$auth_sandbox_id" ] || die "No sign-in sandbox recorded. Run start first"
    remote_bash "$auth_sandbox_id" "$orca_vm_dir/remote/agent-status.sh" >&2 ||
      die "Claude Code is not signed in on $auth_sandbox_id; not snapshotting. Sign in and run finish again, or run abort"
    remote_bash "$auth_sandbox_id" "$orca_vm_dir/remote/clear-orca-user-data.sh" >&2
    snapshot_id="$(snapshot_sandbox "$auth_sandbox_id")"
    merge_local_state "$(node -e 'console.log(JSON.stringify({
      snapshotId: process.argv[1], authSourceSnapshotId: process.argv[2], authSandboxId: "" }))' \
      "$snapshot_id" "$base_snapshot_id")"
    stop_sandbox "$auth_sandbox_id" || log "Could not stop $auth_sandbox_id; stop it by hand"
    log "Signed-in snapshot $snapshot_id is ready"
    ;;
  abort)
    [ -n "$auth_sandbox_id" ] || die "No sign-in sandbox recorded"
    stop_sandbox "$auth_sandbox_id"
    merge_local_state '{"authSandboxId":""}'
    ;;
  *)
    die "Usage: $0 start|finish|abort"
    ;;
esac
cat "$local_state"
