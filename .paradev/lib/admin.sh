# The ParadevAI/admin checkout beside this one, for setup, teardown and the dev stack.

PARADEV_ADMIN_LIB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

is_admin_checkout() {
  local dir="$1" origin
  [ -f "$dir/package.json" ] && [ -f "$dir/scripts/db.sh" ] || return 1
  origin="$(git -C "$dir" remote get-url origin 2>/dev/null)" || return 1
  [[ "$origin" =~ github\.com[/:]ParadevAI/admin(\.git)?/?$ ]]
}

# Prints the admin checkout's directory; fails when the workspace has none.
# The start hook does not get SUPERSET_SANDBOX_REPOSITORIES, so look beside this checkout.
admin_checkout_dir() {
  [ -n "${SUPERSET_SANDBOX_WORKSPACE_ID:-}" ] || return 1
  local parent dir
  parent="$(dirname "$PARADEV_ADMIN_LIB_ROOT")"
  [ "$parent" != "/" ] || return 1
  for dir in "$parent"/*/; do
    dir="${dir%/}"
    [ "$dir" != "$PARADEV_ADMIN_LIB_ROOT" ] || continue
    if is_admin_checkout "$dir"; then
      printf '%s\n' "$dir"
      return 0
    fi
  done
  return 1
}

# Named after the workspace id, so two workspaces never share a branch. The
# admin repo's scripts/db.sh names it after the checkout folder: "admin" everywhere.
admin_branch_name() {
  printf 'workspace/cloud-%s' "${SUPERSET_SANDBOX_WORKSPACE_ID}"
}

# The admin branch id setup wrote to the checkout's .env.workspace; empty when none.
admin_workspace_branch_id() {
  [ -f "$1/.env.workspace" ] || return 0
  (
    unset ADMIN_NEON_BRANCH_ID
    set -a
    # shellcheck source=/dev/null
    . "$1/.env.workspace" > /dev/null 2>&1
    printf '%s' "${ADMIN_NEON_BRANCH_ID:-}"
  )
}
