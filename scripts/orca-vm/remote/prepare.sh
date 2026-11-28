# shellcheck shell=bash
# Runs inside a new workspace sandbox. Needs ORCA_PROJECT_ROOT and ORCA_REPO_REF;
# ORCA_GIT_TOKEN, GIT_USER_NAME and GIT_USER_EMAIL are optional.
set -euo pipefail
exec 1>&2

chmod 700 "$HOME/.orca-vm-env"
chmod 600 "$HOME/.orca-vm-env/.env"

if [ -n "${ORCA_GIT_TOKEN:-}" ]; then
  printf '%s' "$ORCA_GIT_TOKEN" | gh auth login --hostname github.com --git-protocol https --with-token
  gh auth setup-git
fi
[ -z "${GIT_USER_NAME:-}" ] || git config --global user.name "$GIT_USER_NAME"
[ -z "${GIT_USER_EMAIL:-}" ] || git config --global user.email "$GIT_USER_EMAIL"

export GIT_TERMINAL_PROMPT=0
cd "$ORCA_PROJECT_ROOT"
git fetch origin "$ORCA_REPO_REF"
git checkout -B "$ORCA_REPO_REF" FETCH_HEAD
