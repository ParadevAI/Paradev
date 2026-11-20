#!/usr/bin/env bash
# orca.yaml `scripts.setup`: Paradev's workspace setup for an Orca worktree, on
# a machine someone owns or in a sandbox made by vercel-create.sh.
set -euo pipefail

worktree="${ORCA_WORKTREE_PATH:-$PWD}"
workspace_name="${ORCA_WORKSPACE_NAME:-$(basename "$worktree")}"

if [ -f "$HOME/.orca-vm-env/.env" ]; then
  export SUPERSET_ROOT_PATH="$HOME/.orca-vm-env"
  # Nothing archives a sandbox's Neon branch, so it expires unless setup renews it.
  export NEON_BRANCH_LEASE_DAYS="${NEON_BRANCH_LEASE_DAYS:-7}"
  workspace_name="orca-vm-$workspace_name"
else
  export SUPERSET_ROOT_PATH="${SUPERSET_ROOT_PATH:-${ORCA_ROOT_PATH:?ORCA_ROOT_PATH is not set}}"
fi
export SUPERSET_WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$workspace_name}"

cd "$worktree"
exec ./.paradev/setup.sh
