#!/usr/bin/env bash
# Spike: age a workspace, then re-measure daily work. aging.sh A|C <target GB written>
set -uo pipefail
L="$1"; TARGET_GB="${2:-30}"
OUT=/var/tmp/aging.csv
DEV=$([ "$L" = C ] && findmnt -no SOURCE /mnt/superset-drive || findmnt -no SOURCE /)
DEV=${DEV#/dev/}
U_ENV=(HOME=/home/ubuntu USER=ubuntu PATH=/home/ubuntu/.bun/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin CI=1
	GIT_AUTHOR_NAME=b GIT_AUTHOR_EMAIL=b@x GIT_COMMITTER_NAME=b GIT_COMMITTER_EMAIL=b@x)
as_user() {
	if [ "$L" = C ]; then superset-overlay-root run runuser -u ubuntu -- env -i "${U_ENV[@]}" bash -c "$1"
	else runuser -u ubuntu -- env -i "${U_ENV[@]}" bash -c "$1"; fi
}
written_gb() { awk '{printf "%.1f", $7 * 512 / 1e9}' "/sys/block/${DEV}/stat"; }
used_gb() { df --output=used "$1" | tail -1 | awk '{printf "%.2f", $1 / 1048576}'; }
upper_gb() { [ "$L" = C ] && used_gb /mnt/superset-drive || used_gb /; }
start=$(written_gb)
echo "layout,iteration,device_written_gb,layer_used_gb,iteration_s" > "$OUT"
echo "$L,0,0,$(upper_gb),0" >> "$OUT"
i=0
while :; do
	i=$((i + 1)); s=$(date +%s)
	as_user 'cd /workspace && rm -rf node_modules ~/.bun/install/cache && bun install --frozen-lockfile > /dev/null 2>&1
		bun add -d is-odd@3 left-pad > /dev/null 2>&1; bun remove is-odd left-pad > /dev/null 2>&1; git checkout -q -- package.json bun.lock
		for b in bench-old bench-head bench-old bench-head; do git checkout -q -f "$b"; done
		mkdir -p ~/churn && for d in $(seq 1 20); do mkdir -p ~/churn/$d; for f in $(seq 1 500); do head -c 8192 /dev/urandom > ~/churn/$d/$f; done; done
		head -c 3G /dev/urandom > ~/churn/big && sync && rm -rf ~/churn
		cd /workspace/bench/vite 2>/dev/null && rm -rf node_modules packages/*/node_modules && pnpm install --frozen-lockfile --ignore-scripts > /dev/null 2>&1; true'
	w=$(echo "$(written_gb) - $start" | bc)
	echo "$L,$i,$w,$(upper_gb),$(( $(date +%s) - s ))" >> "$OUT"
	[ "$(echo "$w >= $TARGET_GB" | bc)" = 1 ] && break
done
cat "$OUT"
