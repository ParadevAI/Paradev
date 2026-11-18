# Sets up the ParadevAI/admin checkout in a cloud workspace that has one. Only
# this repository's config runs on boot. The Neon project, role and database
# come from the environment's variables, not from this public repository.

ADMIN_NEON_VARS="ADMIN_NEON_PROJECT_ID ADMIN_NEON_PARENT_BRANCH ADMIN_NEON_DATABASE ADMIN_NEON_ROLE"

admin_neon_missing() {
  local var missing=""
  for var in $ADMIN_NEON_VARS NEON_API_KEY; do
    [ -n "${!var:-}" ] || missing+=" $var"
  done
  command -v neonctl &> /dev/null || missing+=" neonctl"
  command -v jq &> /dev/null || missing+=" jq"
  printf '%s' "${missing# }"
}

admin_connection_string() {
  neonctl connection-string "$1" --project-id "$ADMIN_NEON_PROJECT_ID" \
    --database-name "$ADMIN_NEON_DATABASE" --role-name "$ADMIN_NEON_ROLE" "${@:2}"
}

# Safe on every boot: installs only into a fresh checkout. A later boot that
# cannot reach the admin branch leaves .env.workspace alone and fails.
step_setup_admin_checkout() {
  local dir="$1"
  echo "🧰 Setting up the admin checkout at $dir..."

  if [ -d "$dir/vendor/superset/.git" ] && [ -d "$dir/node_modules" ]; then
    echo "  vendor/ and node_modules already present"
  elif ! (cd "$dir" && bun run setup); then
    error "bun run setup failed in $dir"
    return 1
  fi

  if [ ! -e "$dir/.env" ] && [ ! -L "$dir/.env" ]; then
    ln -s "$PARADEV_ADMIN_LIB_ROOT/.env" "$dir/.env"
  fi

  # Later lines of .env win, and the workspace's own come after the environment's.
  local product_pooled product_direct
  IFS='|' read -r product_pooled product_direct < <(
    set -a
    # shellcheck source=/dev/null
    . "$PARADEV_ADMIN_LIB_ROOT/.env" > /dev/null 2>&1
    printf '%s|%s\n' "${DATABASE_URL:-}" "${DATABASE_URL_UNPOOLED:-}"
  )
  if ! grep -q "^NEON_BRANCH_ID=" "$PARADEV_ADMIN_LIB_ROOT/.env" 2>/dev/null || [ -z "$product_pooled" ]; then
    error "This workspace has no product database branch yet; not pointing the admin app at one"
    return 1
  fi

  local kept_branch_id admin_pooled="" admin_direct="" admin_source="" branch_id="" problem=""
  kept_branch_id="$(admin_workspace_branch_id "$dir")"
  local missing
  missing="$(admin_neon_missing)"
  if [ -n "$missing" ]; then
    problem="Not set or not installed: $missing"
  elif find_or_create_neon_branch "$ADMIN_NEON_PROJECT_ID" "$(admin_branch_name)" "$ADMIN_NEON_PARENT_BRANCH" &&
      branch_id="$BRANCH_ID" &&
      admin_pooled="$(admin_connection_string "$branch_id" --pooled)" &&
      admin_direct="$(admin_connection_string "$branch_id")"; then
    admin_source="admin branch $(admin_branch_name)"
  else
    branch_id=""
    problem="Could not get the admin branch $(admin_branch_name)"
  fi

  if [ -n "$problem" ]; then
    if [ -n "$kept_branch_id" ]; then
      error "$problem. Keeping $dir/.env.workspace on its branch $kept_branch_id; it was not changed"
      return 1
    fi
    admin_pooled="${ADMIN_DATABASE_URL:-}"
    admin_direct="${ADMIN_DATABASE_URL_UNPOOLED:-}"
    if [ -n "$admin_pooled" ]; then
      admin_source="the environment's ADMIN_DATABASE_URL (shared)"
    else
      admin_source="an in-memory admin database"
    fi
    warn "$problem. The admin app uses $admin_source"
    step_skipped "Admin branch: not made, admin app uses $admin_source"
  fi

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
    if [ -n "${DEV_USER_EMAIL:-}" ]; then
      write_env_var "DEV_USER_EMAIL" "$DEV_USER_EMAIL"
    fi
  } > "$tmp"
  install -m 600 "$tmp" "$dir/.env.workspace"
  rm -f "$tmp"
  echo "  Wrote $dir/.env.workspace (product: this workspace's branch; admin: $admin_source)"

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
