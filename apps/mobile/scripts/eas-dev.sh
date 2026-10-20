#!/usr/bin/env bash
# Brings up the mobile dev-client on an EAS cloud iOS simulator, from a
# machine with no local Xcode (a cloud sandbox), connected to this machine's
# Metro and API.
#
# The simulator installs a finished EAS simulator build whose native
# fingerprint matches this checkout. One is built only when none exists: the
# first time, or after a native change. JS/TS changes ship through Metro.
#
# Usage:
#   apps/mobile/scripts/eas-dev.sh             # reuse this checkout's running session, else start one
#   apps/mobile/scripts/eas-dev.sh --new       # stop the running session and start a fresh one
#   apps/mobile/scripts/eas-dev.sh --reload    # load the app from Metro again; starts nothing
#   MOBILE_EAS_BUILD_ID=<id> apps/mobile/scripts/eas-dev.sh   # install this build, skip the lookup
#
# Requires: EXPO_TOKEN (or `eas login`), this repo's .env already written
# (.superset/setup.sh or setup.cloud.sh), and local egress enabled on the Expo
# account.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
cd "$ROOT_DIR"

NEW=0
RELOAD=0
for arg in "$@"; do
	case "$arg" in
	--new) NEW=1 ;;
	--reload) RELOAD=1 ;;
	*)
		echo "Unknown argument: $arg" >&2
		exit 1
		;;
	esac
done
if [ "$NEW" = "1" ] && [ "$RELOAD" = "1" ]; then
	echo "--new and --reload cannot be used together." >&2
	exit 1
fi

if [ ! -f .env ]; then
	echo "No .env here — run .superset/setup.sh or .superset/setup.cloud.sh first." >&2
	exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

METRO_PORT=8081
API_PORT="${API_PORT:?API_PORT is missing from .env}"
BUILD_PROFILE=development-simulator
IDLE_MINUTES="${MOBILE_EAS_IDLE_MINUTES:-15}"
SESSION_FILE=apps/mobile/.env.eas-simulator
STATE_DIR="$ROOT_DIR/.tmp/eas-dev"
EGRESS_LOG="$STATE_DIR/egress.log"
EGRESS_PID_FILE="$STATE_DIR/egress.pid"
METRO_LOG="$STATE_DIR/metro.log"
METRO_PID_FILE="$STATE_DIR/metro.pid"
LOAD_ATTEMPTS=3
BUNDLE_WAIT_SECONDS=90

cd apps/mobile

DEV_CLIENT_URL="superset://expo-development-client/?url=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "http://localhost:$METRO_PORT")&disableAutoLaunch=1&disableFab=1"

# The runtime version is a fingerprint of the app config. EAS resolves it
# without this machine's dev values, so the build and its lookup must too.
without_dev_env() {
	local unset_args=() name
	for name in $(compgen -v EXPO_PUBLIC_) MOBILE_SIGNED_UPDATES; do unset_args+=(-u "$name"); done
	env "${unset_args[@]}" "$@"
}

json() {
	node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s.slice(s.search(/[\[{]/)));console.log(eval(process.argv[1])??"")})' "$1"
}

session_id() {
	[ -f "$ROOT_DIR/$SESSION_FILE" ] || return 0
	sed -n "s/^EAS_SIMULATOR_SESSION_ID='\(.*\)'$/\1/p" "$ROOT_DIR/$SESSION_FILE"
}

session_running() {
	local id
	id="$(session_id)"
	[ -n "$id" ] || return 1
	[ "$(eas simulator:get --id "$id" --json --non-interactive 2>/dev/null | json 'j.status')" = "IN_PROGRESS" ]
}

metro_running() {
	curl -s "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"
}

agent_device() {
	if command -v agent-device >/dev/null 2>&1; then
		(
			set -a
			# shellcheck disable=SC1090
			source "$ROOT_DIR/$SESSION_FILE"
			set +a
			agent-device "$@"
		)
	else
		eas simulator:exec npx -y agent-device "$@"
	fi
}

process_cwd() {
	if [ -d /proc ]; then
		readlink "/proc/$1/cwd" 2>/dev/null || true
	else
		lsof -a -d cwd -p "$1" -Fn 2>/dev/null | sed -n 's/^n//p'
	fi
}

is_own_egress_client() {
	[ "$(process_cwd "$1")" = "$PWD" ] && ps -o command= -p "$1" 2>/dev/null | grep -q "simulator:egress"
}

egress_pids() {
	local pid
	for pid in $(pgrep -f "eas simulator:egress" || true); do
		if is_own_egress_client "$pid"; then echo "$pid"; fi
	done
}

egress_connected() {
	grep -E "Egress tunnel (connected|disconnected)" "$EGRESS_LOG" 2>/dev/null | tail -n 1 | grep -q "Egress tunnel connected"
}

egress_healthy() {
	local pid
	pid="$(cat "$EGRESS_PID_FILE" 2>/dev/null || true)"
	[ -n "$pid" ] && is_own_egress_client "$pid" &&
		grep -qF "simulator session $1." "$EGRESS_LOG" 2>/dev/null &&
		egress_connected
}

stop_egress() {
	local pid
	for pid in $(egress_pids); do
		pkill -P "$pid" 2>/dev/null || true
		kill "$pid" 2>/dev/null || true
	done
	rm -f "$EGRESS_PID_FILE"
}

# The egress client reads .env.eas-simulator once, at start, so it stays bound
# to the session that was current then.
start_egress() {
	stop_egress
	echo "==> Egress for session $1"
	nohup eas simulator:egress >"$EGRESS_LOG" 2>&1 </dev/null &
	echo $! >"$EGRESS_PID_FILE"
	for _ in $(seq 1 60); do
		egress_connected && return 0
		sleep 1
	done
	echo "The egress tunnel did not connect in 60 s. See $EGRESS_LOG." >&2
	exit 1
}

bundle_count() {
	local count
	count="$(grep -c "iOS Bundled" "$METRO_LOG" 2>/dev/null || true)"
	echo "${count:-0}"
}

metro_started_here() {
	local pid
	pid="$(cat "$METRO_PID_FILE" 2>/dev/null || true)"
	[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && [ -f "$METRO_LOG" ]
}

load_app() {
	local attempt before
	if ! metro_started_here; then
		echo "==> Loading the app from Metro (not confirmed: Metro was not started by this script)"
		agent_device open "$DEV_CLIENT_URL" >/dev/null 2>&1 || true
		agent_device alert accept >/dev/null 2>&1 || true
		return 0
	fi
	for attempt in $(seq 1 "$LOAD_ATTEMPTS"); do
		echo "==> Loading the app from Metro (attempt $attempt of $LOAD_ATTEMPTS)"
		before="$(bundle_count)"
		agent_device open "$DEV_CLIENT_URL" >/dev/null 2>&1 || true
		agent_device alert accept >/dev/null 2>&1 || true
		for _ in $(seq 1 "$BUNDLE_WAIT_SECONDS"); do
			if [ "$(bundle_count)" -gt "$before" ]; then
				echo "==> Metro served the bundle"
				return 0
			fi
			sleep 1
		done
	done
	echo "Metro served no bundle after $LOAD_ATTEMPTS tries. See $METRO_LOG and $EGRESS_LOG." >&2
	exit 1
}

# simctl is not reachable from here, so the intro cannot be turned off with
# `defaults write`. Showing the keyboard once in Settings and pressing Continue
# marks it as shown for the whole simulator.
dismiss_keyboard_intro() {
	local output
	agent_device open com.apple.Preferences --relaunch >/dev/null 2>&1 || return 0
	output="$(agent_device press 'role="search"' --settle 2>&1 || true)"
	if [[ "$output" == *UIContinuousPathIntroductionView* ]]; then
		echo "==> Dismissing the slide-to-type keyboard intro"
		agent_device press 'label="Continue"' --settle >/dev/null 2>&1 || true
	else
		echo "==> No slide-to-type keyboard intro found"
	fi
	agent_device close com.apple.Preferences >/dev/null 2>&1 || true
}

mkdir -p "$STATE_DIR"

if [ "$RELOAD" = "1" ]; then
	metro_running || {
		echo "Metro is not running. Run apps/mobile/scripts/eas-dev.sh without --reload." >&2
		exit 1
	}
	session_running || {
		echo "No running simulator session. Run apps/mobile/scripts/eas-dev.sh without --reload." >&2
		exit 1
	}
	egress_healthy "$(session_id)" || {
		echo "The egress client is not connected to session $(session_id). Run apps/mobile/scripts/eas-dev.sh without --reload." >&2
		exit 1
	}
	load_app
	exit 0
fi

if ! metro_running; then
	echo "==> Starting Metro"
	nohup bunx expo start --dev-client --port "$METRO_PORT" >"$METRO_LOG" 2>&1 </dev/null &
	echo $! >"$METRO_PID_FILE"
	for _ in $(seq 1 30); do
		metro_running && break
		sleep 2
	done
	metro_running || {
		echo "Metro did not start in 60 s. See $METRO_LOG." >&2
		exit 1
	}
fi

if [ "$NEW" = "1" ] && session_running; then
	echo "==> Stopping session $(session_id)"
	eas simulator:stop --id "$(session_id)" --non-interactive >/dev/null
fi

STARTED=0
if session_running; then
	echo "==> Reusing session $(session_id)"
else
	STARTED=1
	BUILD_ID="${MOBILE_EAS_BUILD_ID:-}"
	if [ -z "$BUILD_ID" ]; then
		BUN_PINNED="$(cat "$ROOT_DIR/.bun-version")"
		if [ "$(bun --version)" != "$BUN_PINNED" ]; then
			echo "bun $(bun --version) is installed, but .bun-version pins $BUN_PINNED. No build matches the fingerprint of dependencies it installed." >&2
			echo "In a cloud workspace, create a new one from the current image. Or set MOBILE_EAS_BUILD_ID to install a known build." >&2
			exit 1
		fi
		HASH="$(without_dev_env eas fingerprint:generate -p ios --build-profile "$BUILD_PROFILE" --json --non-interactive | json 'j.hash')"
		BUILD_ID="$(eas build:list -p ios --build-profile "$BUILD_PROFILE" --status finished --fingerprint-hash "$HASH" --limit 1 --json --non-interactive | json 'j[0]?.id')"
		if [ -z "$BUILD_ID" ]; then
			echo "==> No simulator build has fingerprint ${HASH:0:12} — building one (about 15 minutes)"
			BUILD_ID="$(without_dev_env eas build -p ios --profile "$BUILD_PROFILE" --non-interactive --wait --json | json 'j[0].id')"
		fi
	fi
	echo "==> Build $BUILD_ID"

	EGRESS_PORTS=("$METRO_PORT" "$API_PORT")
	[ -n "${REALTIME_PORT:-}" ] && EGRESS_PORTS+=("$REALTIME_PORT")
	[ -n "${RELAY_PORT:-}" ] && EGRESS_PORTS+=("$RELAY_PORT")
	ALLOW=()
	for port in "${EGRESS_PORTS[@]}"; do ALLOW+=(--egress-allow "localhost:$port"); done
	TAGS=()
	[ -n "${SUPERSET_SANDBOX_WORKSPACE_ID:-}" ] && TAGS+=(--tag "$SUPERSET_SANDBOX_WORKSPACE_ID")

	echo "==> Simulator (egress ports ${EGRESS_PORTS[*]})"
	eas simulator -p ios --type agent-device --build-id "$BUILD_ID" \
		--open-url "$DEV_CLIENT_URL" \
		--egress local "${ALLOW[@]}" "${TAGS[@]}" \
		--max-idle-time-minutes "$IDLE_MINUTES" \
		--out-config-type dotenv --non-interactive --force
fi

if [ "$STARTED" = "1" ] || ! egress_healthy "$(session_id)"; then
	start_egress "$(session_id)"
	[ "$STARTED" = "1" ] && dismiss_keyboard_intro
	load_app
fi

SESSION_ID="$(session_id)"
PREVIEW_URL="$(eas simulator:get --id "$SESSION_ID" --json --non-interactive 2>/dev/null | json 'j.remoteConfig?.webPreviewUrl')"

cat <<SUMMARY

Ready.
  Session:     $SESSION_ID
  Preview:     $PREVIEW_URL
  Drive it:    (cd apps/mobile && set -a && . ./.env.eas-simulator && set +a && agent-device snapshot -i)
               needs "npm install -g agent-device"; through npx each command takes about 25 s
  Reload it:   apps/mobile/scripts/eas-dev.sh --reload
  Stop it:     (cd apps/mobile && eas simulator:stop --id $SESSION_ID)
  Metro log:   $METRO_LOG
  Egress log:  $EGRESS_LOG

The relay and realtime ports are forwarded, but this starts neither service:
run "bun dev:realtime" for live cloud rows, and the relay for host presence.
See apps/mobile/AGENTS.md.
SUMMARY
