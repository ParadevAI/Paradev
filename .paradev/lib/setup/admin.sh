# The admin repository (ParadevAI/admin) beside this checkout, in a cloud
# workspace whose environment has both repositories. Only this repository's
# config runs on boot, so its setup sets up the admin checkout too. A
# workspace without the admin checkout gets none of this.

ADMIN_NEON_PROJECT_ID="aged-night-40823751" # superset-admin
ADMIN_NEON_PARENT_BRANCH="development"

# The admin checkout's directory, from the repositories the platform checked
# out (SUPERSET_SANDBOX_REPOSITORIES). Fails when there is none.
admin_checkout_dir() {
  local repos="${SUPERSET_SANDBOX_REPOSITORIES:-}"
  local root="${SUPERSET_SANDBOX_WORKSPACE_PATH:-}"
  [ -n "$repos" ] && [ -n "$root" ] || return 1
  command -v jq &> /dev/null || return 1
  local path
  path="$(jq -r '
    map(select(.url | test("github\\.com[/:]ParadevAI/admin(\\.git)?/?$"; "i")))
    | .[0].path // empty' <<< "$repos" 2>/dev/null)" || return 1
  # "." would make admin the primary repository, whose own config runs instead.
  [ -n "$path" ] && [ "$path" != "." ] || return 1
  local dir="$root/$path"
  [ -f "$dir/package.json" ] && [ -f "$dir/scripts/db.sh" ] || return 1
  printf '%s\n' "$dir"
}

# One workspace's admin database: a branch of superset-admin's development
# branch, named after the workspace id like its product branch, so two
# workspaces never share one. (The admin repo's scripts/db.sh names branches
# after the checkout's folder, which is "admin" in every cloud workspace.)
admin_branch_name() {
  printf 'workspace/cloud-%s' "${SUPERSET_SANDBOX_WORKSPACE_ID}"
}

# Prints the admin branch's id, creating the branch or renewing its lease.
ensure_admin_neon_branch() {
  local name lease_expiry branches branch_id
  name="$(admin_branch_name)"
  lease_expiry="$(neon_branch_lease_expiry)"

  branches="$(neonctl branches list --project-id "$ADMIN_NEON_PROJECT_ID" --output json)" || return 1
  validate_json "$branches" "superset-admin branches list" || return 1
  branch_id="$(jq -r --arg n "$name" '.[] | select(.name == $n) | .id // empty' <<< "$branches")"

  if [ -n "$branch_id" ]; then
    if [ -n "$lease_expiry" ]; then
      neonctl branches set-expiration "$branch_id" --project-id "$ADMIN_NEON_PROJECT_ID" \
        --expires-at "$lease_expiry" --output json > /dev/null ||
        warn "Could not renew the admin branch lease (continuing)" >&2
    fi
  else
    local lease_args=() created
    [ -n "$lease_expiry" ] && lease_args=(--expires-at "$lease_expiry")
    created="$(neonctl branches create --project-id "$ADMIN_NEON_PROJECT_ID" \
      --name "$name" --parent "$ADMIN_NEON_PARENT_BRANCH" \
      ${lease_args[@]+"${lease_args[@]}"} --output json)" || return 1
    validate_json "$created" "superset-admin branch creation" || return 1
    branch_id="$(jq -r '.branch.id // .id // empty' <<< "$created")"
    [ -n "$branch_id" ] || return 1
    echo "  Created superset-admin branch $name from $ADMIN_NEON_PARENT_BRANCH" >&2
  fi
  printf '%s\n' "$branch_id"
}

# DEV_USER_EMAIL as the admin repo's scripts/db.sh picks it: the environment's,
# else an @superset.sh git address, else dev@superset.sh.
admin_dev_user_email() {
  local dir="$1" email="${DEV_USER_EMAIL:-}"
  [ -n "$email" ] || email="$(git -C "$dir" config user.email 2>/dev/null || true)"
  case "$email" in
    *@superset.sh) printf '%s\n' "$email" ;;
    *) printf 'dev@superset.sh\n' ;;
  esac
}

# Safe on every boot: installs only into a fresh checkout, and rewrites
# .env.workspace from the same branches each time.
step_setup_admin_checkout() {
  local dir="$1"
  echo "🧰 Setting up the admin checkout at $dir..."

  # The admin repo's own cloud setup (.superset/setup.cloud.sh) does the same.
  if [ -d "$dir/vendor/superset/.git" ] && [ -d "$dir/node_modules" ]; then
    echo "  vendor/ and node_modules already present"
  elif ! (cd "$dir" && bun run setup); then
    error "bun run setup failed in $dir"
    return 1
  fi

  # The workspace's keys and ports, as a worktree of the admin repo links its
  # main checkout's .env. A file someone put there is theirs; leave it.
  if [ ! -e "$dir/.env" ] && [ ! -L "$dir/.env" ]; then
    ln -s "$ROOT_DIR/.env" "$dir/.env"
  fi

  # This workspace's product branch, from the .env setup wrote (later lines
  # win, and the workspace's own come after the environment's).
  local product_pooled product_direct
  product_pooled="$(set -a; . "$ROOT_DIR/.env" > /dev/null 2>&1; printf '%s' "${DATABASE_URL:-}")"
  product_direct="$(set -a; . "$ROOT_DIR/.env" > /dev/null 2>&1; printf '%s' "${DATABASE_URL_UNPOOLED:-}")"
  if ! grep -q "^NEON_BRANCH_ID=" "$ROOT_DIR/.env" 2>/dev/null || [ -z "$product_pooled" ]; then
    error "This workspace has no product database branch yet; not pointing the admin app at one"
    return 1
  fi

  # Its own admin branch, else the environment's shared development URLs.
  local admin_pooled="" admin_direct="" admin_source="" branch_id=""
  if [ -n "${NEON_API_KEY:-}" ] && command -v neonctl &> /dev/null &&
      branch_id="$(ensure_admin_neon_branch)" &&
      admin_pooled="$(neonctl connection-string "$branch_id" --project-id "$ADMIN_NEON_PROJECT_ID" \
        --database-name admin --role-name admin_owner --pooled)" &&
      admin_direct="$(neonctl connection-string "$branch_id" --project-id "$ADMIN_NEON_PROJECT_ID" \
        --database-name admin --role-name admin_owner)"; then
    admin_source="superset-admin branch $(admin_branch_name)"
  else
    branch_id=""
    admin_pooled="${ADMIN_DATABASE_URL:-}"
    admin_direct="${ADMIN_DATABASE_URL_UNPOOLED:-}"
    if [ -n "$admin_pooled" ]; then
      warn "Could not make a superset-admin branch; using the environment's ADMIN_DATABASE_URL"
      admin_source="the environment's ADMIN_DATABASE_URL (shared)"
    else
      warn "No superset-admin branch and no ADMIN_DATABASE_URL; the admin app uses an in-memory admin database"
      admin_source="in-memory"
    fi
  fi

  # next.config loads .env.workspace last with override, so these win over the
  # environment's DATABASE_URL (the shared one) in the process environment.
  local tmp
  tmp="$(mktemp)"
  {
    echo "# Written by Paradev's .paradev/setup.cloud.sh on every boot: this workspace's"
    echo "# product branch and $admin_source."
    echo "# The environment's DATABASE_URL and ADMIN_DATABASE_URL* are also in every"
    echo "# terminal's environment, and dotenv-cli (bun run db:migrate) does not override"
    echo "# them: load this file first (set -a; . ./.env.workspace; set +a)."
    write_env_var "DATABASE_URL" "$product_pooled"
    write_env_var "DATABASE_URL_UNPOOLED" "${product_direct:-$product_pooled}"
    if [ -n "$admin_pooled" ]; then
      write_env_var "ADMIN_DATABASE_URL" "$admin_pooled"
      write_env_var "ADMIN_DATABASE_URL_UNPOOLED" "${admin_direct:-$admin_pooled}"
    fi
    if [ -n "$branch_id" ]; then
      write_env_var "ADMIN_NEON_BRANCH_ID" "$branch_id"
    fi
    write_env_var "DEV_USER_EMAIL" "$(admin_dev_user_email "$dir")"
  } > "$tmp"
  install -m 600 "$tmp" "$dir/.env.workspace"
  rm -f "$tmp"
  echo "  Wrote $dir/.env.workspace (product: this workspace's branch; admin: $admin_source)"

  # The checkout may carry admin migrations its parent branch has not run.
  # Only on this workspace's own branch: never migrate the shared one.
  if [ -n "$branch_id" ]; then
    if (cd "$dir/app" && ADMIN_DATABASE_URL="$admin_pooled" \
        ADMIN_DATABASE_URL_UNPOOLED="$admin_direct" bunx drizzle-kit migrate > /dev/null); then
      echo "  Admin migrations applied"
    else
      error "Admin migrations failed on $(admin_branch_name)"
      return 1
    fi
  fi

  success "Admin checkout ready: $dir"
  return 0
}

# For the archive hook: delete this workspace's superset-admin branch.
step_delete_admin_neon_branch() {
  admin_checkout_dir > /dev/null || return 0
  echo "🗄️  Deleting the admin Neon branch..."
  if [ -z "${NEON_API_KEY:-}" ] || ! command -v neonctl &> /dev/null; then
    warn "No NEON_API_KEY or neonctl; leaving $(admin_branch_name) to expire"
    return 0
  fi
  local name
  name="$(admin_branch_name)"
  if ! neonctl branches get "$name" --project-id "$ADMIN_NEON_PROJECT_ID" &> /dev/null; then
    echo "  No branch $name"
    return 0
  fi
  if neonctl branches delete "$name" --project-id "$ADMIN_NEON_PROJECT_ID" > /dev/null; then
    success "Admin Neon branch deleted: $name"
  else
    error "Failed to delete admin Neon branch $name (it expires on its own)"
    return 1
  fi
}
