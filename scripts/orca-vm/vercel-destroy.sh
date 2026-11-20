#!/usr/bin/env bash
# Orca recipe `destroy`: stops the sandbox. Reads the lifecycle payload on stdin.
set -euo pipefail
# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_vercel_config

payload="$(cat)"
read_payload() {
  node -e '
    let data = {};
    try { data = JSON.parse(process.argv[1]); } catch {}
    const value = process.argv[2] === "resourceId" ? data.recipeResult?.userData?.resourceId : data.instanceId;
    process.stdout.write(typeof value === "string" ? value : "");' "$payload" "$1"
}
resource_id="$(read_payload resourceId)"
instance_id="$(read_payload instanceId)"
instance_id="${instance_id:-${ORCA_VM_INSTANCE_ID:-}}"
instance_record=""
[ -z "$instance_id" ] || instance_record="$instances_dir/$instance_id"

# A create that never returned a result leaves only the instance record.
if [ -z "$resource_id" ] && [ -n "$instance_record" ] && [ -f "$instance_record" ]; then
  resource_id="$(cat "$instance_record")"
fi
[ -n "$resource_id" ] || die "No sandbox id in the lifecycle payload or in $instances_dir"

stop_sandbox "$resource_id"
[ -z "$instance_record" ] || rm -f "$instance_record"
