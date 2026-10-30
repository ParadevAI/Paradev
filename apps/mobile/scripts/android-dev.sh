#!/usr/bin/env bash
# Runs the mobile dev client on a local Android emulator, connected to this
# worktree's Metro, API, relay and realtime.
#
# The emulator is shared by every worktree on the machine, and they all install
# the same package (sh.superset.mobile). The script writes which worktree and
# native fingerprint the installed APK came from onto the device, and rebuilds
# only when that does not match this checkout. JS/TS changes ship through Metro.
#
# Usage:
#   apps/mobile/scripts/android-dev.sh             # boot, build if needed, start Metro, open the app
#   apps/mobile/scripts/android-dev.sh --doctor    # check the toolchain and print what is missing
#   apps/mobile/scripts/android-dev.sh --reload    # open the app from Metro again; starts nothing
#   apps/mobile/scripts/android-dev.sh --rebuild   # build and install even if the APK matches
#   apps/mobile/scripts/android-dev.sh --user maya@local.test   # also sign in as this dev account
#   apps/mobile/scripts/android-dev.sh --shot out.png           # screenshot the emulator
#   apps/mobile/scripts/android-dev.sh --stop      # stop this worktree's Metro
#
# Env: ANDROID_SERIAL (emulator-<port>, pins one emulator), MOBILE_AVD (default:
# first AVD), MOBILE_METRO_PORT (default: first free
# port from 8081), ANDROID_HOME, JAVA_HOME (must be JDK 17).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
cd "$ROOT_DIR"

MODE=run
REBUILD=0
SIGN_IN_EMAIL=""
SHOT=""
while [ $# -gt 0 ]; do
	case "$1" in
	--doctor) MODE=doctor ;;
	--reload) MODE=reload ;;
	--stop) MODE=stop ;;
	--rebuild) REBUILD=1 ;;
	--user)
		SIGN_IN_EMAIL="${2:-}"
		[ $# -gt 1 ] && shift
		;;
	--user=*) SIGN_IN_EMAIL="${1#--user=}" ;;
	--shot)
		MODE=shot
		SHOT="${2:-}"
		[ $# -gt 1 ] && shift
		;;
	*)
		echo "Unknown argument: $1" >&2
		exit 1
		;;
	esac
	shift
done
SIGN_IN_EMAIL="$(printf '%s' "$SIGN_IN_EMAIL" | tr '[:upper:]' '[:lower:]')"
if [ -n "$SIGN_IN_EMAIL" ] && ! [[ "$SIGN_IN_EMAIL" =~ ^[a-z0-9._+-]+@local\.test$ ]]; then
	echo "--user takes a dev account (name@local.test). seed-dev creates it on first use." >&2
	exit 1
fi

PACKAGE=sh.superset.mobile
OWNER_FILE=/data/local/tmp/superset-mobile-owner
STATE_DIR="$ROOT_DIR/.tmp/android-dev"
METRO_LOG="$STATE_DIR/metro.log"
METRO_PID_FILE="$STATE_DIR/metro.pid"
METRO_PORT_FILE="$STATE_DIR/metro.port"
EMULATOR_LOG="$STATE_DIR/emulator.log"
BOOT_WAIT_SECONDS=180
BUNDLE_WAIT_SECONDS=300

find_android_home() {
	local dir
	for dir in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
		[ -n "$dir" ] && [ -x "$dir/platform-tools/adb" ] && {
			echo "$dir"
			return 0
		}
	done
	return 1
}

java_major() {
	"$1/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1
}

# Gradle for RN 0.88 needs JDK 17; macOS often has only Java 8 on PATH.
find_java_home() {
	local dir
	for dir in "${JAVA_HOME:-}" \
		/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
		/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
		"/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
		"$(/usr/libexec/java_home -v 17 2>/dev/null || true)"; do
		[ -n "$dir" ] && [ -x "$dir/bin/java" ] && [ "$(java_major "$dir")" = "17" ] && {
			echo "$dir"
			return 0
		}
	done
	return 1
}

doctor() {
	local ok=1 sdk java avds
	if sdk="$(find_android_home)"; then
		echo "ok   Android SDK: $sdk"
		[ -x "$sdk/emulator/emulator" ] || {
			echo "MISS emulator: sdkmanager 'emulator'"
			ok=0
		}
		avds="$("$sdk/emulator/emulator" -list-avds 2>/dev/null | grep -v '^INFO' || true)"
		if [ -n "$avds" ]; then
			echo "ok   AVDs: $(echo "$avds" | tr '\n' ' ')"
		else
			echo "MISS AVD: create one in Android Studio > Device Manager (API 33+ with Google Play, for Google sign-in)"
			ok=0
		fi
	else
		echo "MISS Android SDK: install Android Studio, or set ANDROID_HOME"
		ok=0
	fi
	if java="$(find_java_home)"; then
		echo "ok   JDK 17: $java"
	else
		echo "MISS JDK 17: brew install openjdk@17"
		ok=0
	fi
	if [ -f .env ]; then
		echo "ok   .env"
	else
		echo "MISS .env: run .superset/setup.sh"
		ok=0
	fi
	command -v maestro >/dev/null 2>&1 && echo "ok   maestro (for --user)" ||
		echo "info maestro not found: --user needs it (curl -fsSL https://get.maestro.mobile.dev | bash)"
	[ "$ok" = 1 ]
}

if [ "$MODE" = doctor ]; then
	doctor
	exit $?
fi

ANDROID_HOME="$(find_android_home)" || {
	doctor
	exit 1
}
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

[ -f .env ] || {
	echo "No .env here — run .superset/setup.sh first." >&2
	exit 1
}
set -a
# shellcheck disable=SC1091
source .env
set +a

mkdir -p "$STATE_DIR"

port_free() {
	! lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

metro_port() {
	if [ -n "${MOBILE_METRO_PORT:-}" ]; then
		echo "$MOBILE_METRO_PORT"
	elif [ -f "$METRO_PORT_FILE" ] &&
		{ own_metro_pid >/dev/null || port_free "$(cat "$METRO_PORT_FILE")"; }; then
		cat "$METRO_PORT_FILE"
	else
		local port=8081
		while ! port_free "$port"; do port=$((port + 1)); done
		echo "$port" >"$METRO_PORT_FILE"
		echo "$port"
	fi
}

metro_running() {
	curl -s "http://127.0.0.1:$1/status" 2>/dev/null | grep -q "packager-status:running"
}

own_metro_pid() {
	[ -f "$METRO_PID_FILE" ] || return 1
	local pid
	pid="$(cat "$METRO_PID_FILE")"
	kill -0 "$pid" 2>/dev/null && echo "$pid"
}

if [ "$MODE" = stop ]; then
	if pid="$(own_metro_pid)"; then
		kill "$pid" && echo "Stopped Metro ($pid)."
	else
		echo "No Metro from this worktree is running."
	fi
	rm -f "$METRO_PID_FILE"
	exit 0
fi

# ANDROID_SERIAL=emulator-<port> pins one emulator, so parallel worktrees each
# drive their own; MOBILE_AVD then names the AVD to boot on that port.
device_serial() {
	if [ -n "${ANDROID_SERIAL:-}" ]; then
		adb devices | awk -v s="$ANDROID_SERIAL" 'NR > 1 && $1 == s && $2 == "device" { print $1 }'
		return
	fi
	adb devices | awk 'NR > 1 && $2 == "device" && $1 ~ /^emulator-/ { print $1; exit }'
}

boot_emulator() {
	local serial avd
	serial="$(device_serial)"
	if [ -n "$serial" ]; then
		echo "$serial"
		return 0
	fi
	avd="${MOBILE_AVD:-$(emulator -list-avds 2>/dev/null | grep -v '^INFO' | head -1)}"
	[ -n "$avd" ] || {
		echo "No AVD. Create one in Android Studio > Device Manager." >&2
		return 1
	}
	echo "==> Booting $avd" >&2
	local port_args=()
	[[ "${ANDROID_SERIAL:-}" =~ ^emulator-([0-9]+)$ ]] && port_args=(-port "${BASH_REMATCH[1]}")
	nohup emulator -avd "$avd" ${port_args[@]+"${port_args[@]}"} -no-snapshot-save -no-boot-anim >"$EMULATOR_LOG" 2>&1 </dev/null &
	for _ in $(seq 1 "$BOOT_WAIT_SECONDS"); do
		serial="$(device_serial)"
		if [ -n "$serial" ] && [ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then
			echo "$serial"
			return 0
		fi
		sleep 1
	done
	echo "The emulator did not boot in ${BOOT_WAIT_SECONDS}s. See $EMULATOR_LOG." >&2
	return 1
}

if [ "$MODE" = shot ]; then
	[ -n "$SHOT" ] || {
		echo "--shot takes a file path." >&2
		exit 1
	}
	SERIAL="$(device_serial)"
	[ -n "$SERIAL" ] || {
		echo "No emulator is running." >&2
		exit 1
	}
	adb -s "$SERIAL" exec-out screencap -p >"$SHOT"
	echo "$SHOT"
	exit 0
fi

# Every port the app calls must be reversed, or it fails as a network error.
reverse_ports() {
	local port
	for port in "$1" "${API_PORT:-}" "${RELAY_PORT:-}" "${REALTIME_PORT:-}" "${WEB_PORT:-}"; do
		[ -n "$port" ] && adb -s "$SERIAL" reverse "tcp:$port" "tcp:$port" >/dev/null
	done
	for port in "${API_PORT:-}" "${RELAY_PORT:-}"; do
		[ -n "$port" ] && port_free "$port" &&
			echo "warn Nothing listens on :$port, so the app shows \"Could not reach the server\". Start the API and relay: .agents/skills/mobile-android-verification/SKILL.md" >&2
	done
	return 0
}

dev_client_url() {
	echo "superset://expo-development-client/?url=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "http://localhost:$1")&disableAutoLaunch=1&disableFab=1"
}

bundle_count() {
	[ -f "$METRO_LOG" ] || {
		echo 0
		return
	}
	grep -c "Android Bundled" "$METRO_LOG" || true
}

open_app() {
	local before
	before="$(bundle_count)"
	echo "==> Opening the app from Metro on :$1"
	adb -s "$SERIAL" shell am force-stop "$PACKAGE"
	adb -s "$SERIAL" shell am start -a android.intent.action.VIEW -d "'$(dev_client_url "$1")'" "$PACKAGE" >/dev/null
	for _ in $(seq 1 "$BUNDLE_WAIT_SECONDS"); do
		[ "$(bundle_count)" -gt "$before" ] && {
			echo "==> Metro served the bundle"
			return 0
		}
		sleep 1
	done
	echo "Metro served no bundle in ${BUNDLE_WAIT_SECONDS}s. See $METRO_LOG and: adb logcat -d -s ReactNativeJS" >&2
	return 1
}

sign_in_as() {
	command -v maestro >/dev/null 2>&1 || {
		echo "--user needs maestro." >&2
		exit 1
	}
	echo "==> Seeding $1"
	NODE_ENV=development bun run "$ROOT_DIR/packages/auth/src/seed-dev.ts" "$1" >/dev/null
	echo "==> Signing in as $1"
	JAVA_HOME="$JAVA_HOME" maestro --device "$SERIAL" test -e EMAIL="$1" \
		"$ROOT_DIR/apps/mobile/.maestro/flows/dev-sign-in.yml"
}

SERIAL="$(boot_emulator)"
PORT="$(metro_port)"
JAVA_HOME="$(find_java_home)" || {
	echo "JDK 17 not found: brew install openjdk@17" >&2
	exit 1
}
export JAVA_HOME

if [ "$MODE" = reload ]; then
	metro_running "$PORT" || {
		echo "Metro is not running on :$PORT. Run apps/mobile/scripts/android-dev.sh without --reload." >&2
		exit 1
	}
	reverse_ports "$PORT"
	open_app "$PORT"
	[ -n "$SIGN_IN_EMAIL" ] && sign_in_as "$SIGN_IN_EMAIL"
	exit 0
fi

cd apps/mobile

echo "==> Native fingerprint"
FINGERPRINT="$(node_modules/.bin/fingerprint fingerprint:generate . --platform android 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hash))')"
WANT_OWNER="$ROOT_DIR $FINGERPRINT"
HAVE_OWNER="$(adb -s "$SERIAL" shell cat "$OWNER_FILE" 2>/dev/null | tr -d '\r' || true)"
INSTALLED="$(adb -s "$SERIAL" shell pm list packages "$PACKAGE" 2>/dev/null | tr -d '\r')"

if [ "$REBUILD" = 1 ] || [ -z "$INSTALLED" ] || [ "$HAVE_OWNER" != "$WANT_OWNER" ]; then
	if [ -n "$HAVE_OWNER" ] && [ "${HAVE_OWNER%% *}" != "$ROOT_DIR" ]; then
		echo "==> The installed APK came from ${HAVE_OWNER%% *}; replacing it with this worktree's build"
	fi
	ABI="$(adb -s "$SERIAL" shell getprop ro.product.cpu.abi | tr -d '\r')"
	echo "==> Building the dev client for $ABI (the first build takes about 10 minutes)"
	CI=1 npx expo prebuild -p android --no-install >"$STATE_DIR/prebuild.log" 2>&1 || {
		tail -20 "$STATE_DIR/prebuild.log" >&2
		exit 1
	}
	(cd android && ./gradlew assembleDebug -PreactNativeArchitectures="$ABI" -q) >"$STATE_DIR/gradle.log" 2>&1 || {
		grep -E "error|FAILURE|What went wrong" -A3 "$STATE_DIR/gradle.log" | tail -30 >&2
		echo "Gradle failed. Full log: $STATE_DIR/gradle.log" >&2
		exit 1
	}
	adb -s "$SERIAL" install -r android/app/build/outputs/apk/debug/app-debug.apk >/dev/null
	adb -s "$SERIAL" shell "echo '$WANT_OWNER' > $OWNER_FILE"
	echo "==> Installed"
else
	echo "==> The installed APK matches this checkout"
fi

# The app never asks for it yet, and the agent card needs it on Android 13+.
adb -s "$SERIAL" shell pm grant "$PACKAGE" android.permission.POST_NOTIFICATIONS 2>/dev/null || true

if ! metro_running "$PORT"; then
	echo "==> Starting Metro on :$PORT"
	# --clear: Metro's transform cache is shared across worktrees, and a stale
	# entry fails the Android bundle with ENOENT on react-native-worklets/.worklets.
	nohup bunx expo start --dev-client --port "$PORT" --clear >"$METRO_LOG" 2>&1 </dev/null &
	echo $! >"$METRO_PID_FILE"
	for _ in $(seq 1 60); do
		metro_running "$PORT" && break
		sleep 2
	done
	metro_running "$PORT" || {
		echo "Metro did not start. See $METRO_LOG." >&2
		exit 1
	}
fi

reverse_ports "$PORT"
open_app "$PORT"
[ -n "$SIGN_IN_EMAIL" ] && sign_in_as "$SIGN_IN_EMAIL"
echo "==> Ready. Metro log: $METRO_LOG"
