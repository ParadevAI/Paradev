#!/usr/bin/env bash
# Spike benchmark. Run as root on a box: bench.sh A|B|C. Writes /var/tmp/bench.csv.
set -uo pipefail
L="$1"
OUT="${OUT:-/var/tmp/bench.csv}"
LOG=/var/tmp/bench.log
DRIVE=/mnt/superset-drive
RUNS="${RUNS:-3}"
U_ENV=(HOME=/home/ubuntu USER=ubuntu PATH=/home/ubuntu/.local/bin:/home/ubuntu/.bun/bin:/usr/local/go/bin:/home/ubuntu/go/bin:/usr/local/bin:/usr/bin:/bin
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1 GIT_AUTHOR_NAME=b GIT_AUTHOR_EMAIL=b@x GIT_COMMITTER_NAME=b GIT_COMMITTER_EMAIL=b@x)
[ "$L" = B ] && U_ENV+=(BUN_INSTALL_CACHE_DIR=/workspace/.superset/stores/bun npm_config_store_dir=/workspace/.superset/stores/pnpm)

log() { printf '%s %s\n' "$(date +%T)" "$*" >> "$LOG"; }
# Runs a script as the user in this layout's view of the filesystem.
as_user() {
	if [ "$L" = C ]; then superset-overlay-root run runuser -u ubuntu -- env -i "${U_ENV[@]}" bash -c "$1"
	else runuser -u ubuntu -- env -i "${U_ENV[@]}" bash -c "$1"; fi
}
kb() { { [ "$1" = / ] || mountpoint -q "$1"; } && df --output=used "$1" | tail -1 | tr -d ' ' || echo 0; }
drop() { sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null; }
# measure <tool> <mode> <run> <reset-script> <timed-script>
measure() {
	local tool="$1" mode="$2" run="$3" reset="$4" body="$5" s e rc warn
	as_user "$reset" >> "$LOG" 2>&1
	drop
	local r0 d0; r0=$(kb /); d0=$(kb "$DRIVE")
	s=$(date +%s%N)
	as_user "$body" > /var/tmp/step.out 2>&1; rc=$?
	e=$(date +%s%N)
	warn=$(grep -aiE 'warn|exdev|cross-device|fall(ing)? ?back|copyfile|clonefile' /var/tmp/step.out | grep -viE 'peer|deprecat|engine' | head -3 | tr '\n,' '  ' | cut -c1-160)
	printf '%s,%s,%s,%s,%.2f,%s,%s,%s,%s\n' "$L" "$tool" "$mode" "$run" "$(echo "($e-$s)/1000000000" | bc -l)" "$rc" "$(( $(kb /) - r0 ))" "$(( $(kb "$DRIVE") - d0 ))" "$warn" >> "$OUT"
	tail -3 /var/tmp/step.out >> "$LOG"
	log "$tool $mode $run rc=$rc"
}

B=/workspace/bench
[ -f "$OUT" ] || echo "layout,tool,mode,run,seconds,exit,root_kb_delta,drive_kb_delta,warnings" > "$OUT"

# ---- package managers, cold (no cache, no install dir) and warm (cache kept) ----
if [ -z "${DAILY_ONLY:-}" ]; then
for r in $(seq 1 "$RUNS"); do
	measure bun cold "$r" 'cd /workspace && rm -rf node_modules "${BUN_INSTALL_CACHE_DIR:-$HOME/.bun/install/cache}"' 'cd /workspace && bun install --frozen-lockfile'
	measure bun warm "$r" 'cd /workspace && rm -rf node_modules' 'cd /workspace && bun install --frozen-lockfile'
done
for r in $(seq 1 "$RUNS"); do
	measure pnpm cold "$r" "cd $B/vite && rm -rf node_modules packages/*/node_modules \$(pnpm store path 2>/dev/null)" "cd $B/vite && pnpm install --frozen-lockfile --ignore-scripts"
	measure pnpm warm "$r" "cd $B/vite && rm -rf node_modules packages/*/node_modules" "cd $B/vite && pnpm install --frozen-lockfile --ignore-scripts --offline"
done
for r in $(seq 1 "$RUNS"); do
	measure yarn1 cold "$r" "cd $B/react && rm -rf node_modules && yarn cache clean >/dev/null" "cd $B/react && yarn install --frozen-lockfile --ignore-scripts --ignore-engines"
	measure yarn1 warm "$r" "cd $B/react && rm -rf node_modules" "cd $B/react && yarn install --frozen-lockfile --ignore-scripts --ignore-engines --offline"
done
for r in $(seq 1 "$RUNS"); do
	measure yarn4-nm cold "$r" "cd $B/jest && rm -rf node_modules && corepack yarn cache clean --all >/dev/null" "cd $B/jest && YARN_ENABLE_SCRIPTS=0 corepack yarn install --immutable"
	measure yarn4-nm warm "$r" "cd $B/jest && rm -rf node_modules" "cd $B/jest && YARN_ENABLE_SCRIPTS=0 corepack yarn install --immutable"
done
for r in $(seq 1 "$RUNS"); do
	measure npm cold "$r" "cd $B/TypeScript && rm -rf node_modules ~/.npm/_cacache" "cd $B/TypeScript && npm ci --ignore-scripts --no-audit --no-fund"
	measure npm warm "$r" "cd $B/TypeScript && rm -rf node_modules" "cd $B/TypeScript && npm ci --ignore-scripts --no-audit --no-fund --prefer-offline"
done
for r in $(seq 1 "$RUNS"); do
	measure pip cold "$r" "cd $B/fastapi && rm -rf .venv ~/.cache/pip" "cd $B/fastapi && python3 -m venv .venv && .venv/bin/pip install -q -r requirements-tests.txt"
	measure pip warm "$r" "cd $B/fastapi && rm -rf .venv" "cd $B/fastapi && python3 -m venv .venv && .venv/bin/pip install -q -r requirements-tests.txt"
done
for r in $(seq 1 "$RUNS"); do
	measure uv cold "$r" "cd $B/fastapi && rm -rf .venv-uv ~/.cache/uv" "cd $B/fastapi && uv venv -q .venv-uv && VIRTUAL_ENV=.venv-uv uv pip install -q -r requirements-tests.txt"
	measure uv warm "$r" "cd $B/fastapi && rm -rf .venv-uv" "cd $B/fastapi && uv venv -q .venv-uv && VIRTUAL_ENV=.venv-uv uv pip install -q -r requirements-tests.txt"
done
for r in $(seq 1 "$RUNS"); do
	measure poetry cold "$r" "cd $B/poetry && rm -rf .venv ~/.cache/pypoetry" "cd $B/poetry && poetry config virtualenvs.in-project true && poetry install -q --no-root"
	measure poetry warm "$r" "cd $B/poetry && rm -rf .venv" "cd $B/poetry && poetry install -q --no-root"
done
for r in $(seq 1 "$RUNS"); do
	measure go cold "$r" "cd $B/fzf && chmod -R u+w ~/go/pkg/mod 2>/dev/null; rm -rf ~/go/pkg/mod ~/.cache/go-build" "cd $B/fzf && go build -o /tmp/fzf ."
	measure go warm "$r" "cd $B/fzf && rm -rf ~/.cache/go-build" "cd $B/fzf && go build -o /tmp/fzf ."
done

fi
# ---- daily work ----
for r in $(seq 1 "$RUNS"); do
	measure git-status dirty "$r" 'cd /workspace && git checkout -q -- . && git ls-files "packages/*.ts" | head -300 | while read -r f; do echo "//x" >> "$f"; done' 'cd /workspace && git status --porcelain | wc -l'
	measure git-checkout far "$r" 'cd /workspace && git checkout -q -- . && git checkout -q bench-head' 'cd /workspace && git checkout -q bench-old && git checkout -q bench-head'
	measure git-clone depth1 "$r" "rm -rf $B/clone" "git clone -q --depth 1 https://github.com/paradevai/paradev.git $B/clone"
	measure rg repo "$r" 'true' 'cd /workspace && rg -c --no-messages "import" . | wc -l'
	measure rg all-files "$r" 'true' 'cd /workspace && rg -uu -c --no-messages "function" . | wc -l'
	measure typecheck sandbox "$r" 'true' 'cd /workspace && bunx turbo run typecheck --filter=@superset/sandbox --force --output-logs=errors-only'
	measure test sandbox "$r" 'true' 'cd /workspace/packages/sandbox && bun test 2>&1 | tail -3'
done
log done
echo DONE >> "$LOG"
