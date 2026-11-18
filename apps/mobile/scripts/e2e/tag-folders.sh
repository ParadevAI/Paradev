#!/bin/bash
# Seeds two projects with tagged workspaces on a real host and checks that Home
# groups them into the host's tag folders, in desktop's order. Expects the local
# API, relay and Metro up, the app signed in as the dev account, and $SUPERSET
# set to a CLI for a host on this worktree's relay (see
# .agents/skills/mobile-sim-verification, "A host that serves workspaces").
#
#   SUPERSET=/tmp/e2e/sup UDID=<simulator> apps/mobile/scripts/e2e/tag-folders.sh
#
# UDID picks the simulator when more than one is booted.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${SUPERSET:?set SUPERSET to the test host CLI}"
METRO_PORT="${METRO_PORT:-8081}"
device=()
[ -n "${UDID:-}" ] && device=(--udid "$UDID")

scratch="$(mktemp -d)"
shots="$(mktemp -d)"
created=()
# Archiving removes each workspace's worktree. The CLI cannot delete a
# project, so the two project rows stay on the host.
cleanup() {
	if [ ${#created[@]} -gt 0 ]; then
		"$SUPERSET" workspaces archive --local "${created[@]}" --quiet >/dev/null || true
	fi
}
trap cleanup EXIT

for repo in demo-app api-server; do
	git init -q -b main "$scratch/$repo"
	git -C "$scratch/$repo" -c user.email=e2e@local.test -c user.name=e2e \
		commit -q --allow-empty -m init
done

project() {
	"$SUPERSET" projects create --local --import "$scratch/$1" --name "$1" --json |
		bun -e 'console.log(JSON.parse(await Bun.stdin.text()).projectId)'
}
workspace() {
	local project=$1 name=$2
	shift 2
	created+=("$("$SUPERSET" workspaces create --local --project "$project" \
		--name "$name" --branch "$name" --skip-branch-prefix "$@" --json |
		bun -e 'console.log(JSON.parse(await Bun.stdin.text()).workspace.id)')")
	# createdAt is the order under test; keep the rows apart.
	sleep 1.1
}

demo="$(project demo-app)"
sleep 1.1
api="$(project api-server)"
workspace "$demo" fix-login --tag bugs
workspace "$demo" refactor-auth
workspace "$demo" crash-on-start --tag bugs
workspace "$demo" dark-mode --tag features
workspace "$demo" onboarding-v2 --tag features
workspace "$demo" update-readme
workspace "$api" rate-limits --tag infra
workspace "$api" health-check

host="$("$SUPERSET" status --json | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).hostId)')"
bun --env-file=../../.env scripts/e2e/tag-folder-settings.ts --host "$host" --project "$demo"

maestro ${device[@]+"${device[@]}"} test --test-output-dir "$shots" .maestro/flows/tag-folders/grouped.yml
maestro ${device[@]+"${device[@]}"} test --test-output-dir "$shots" -e METRO_PORT="$METRO_PORT" \
	.maestro/flows/tag-folders/collapse.yml
maestro ${device[@]+"${device[@]}"} test --test-output-dir "$shots" \
	-e FIX_LOGIN_Y="${FIX_LOGIN_Y:-79%}" .maestro/flows/tag-folders/move.yml
maestro ${device[@]+"${device[@]}"} test --test-output-dir "$shots" .maestro/flows/tag-folders/group-menu.yml
bun --env-file=../../.env scripts/e2e/tag-folder-check.ts --host "$host" \
	--project "$demo"
echo "tag folders: passed. Check the screenshots in $shots"
