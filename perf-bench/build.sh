#!/usr/bin/env bash
# Builds the bench entry in production mode inside worktree $1 with its own toolchain.
n=$1
/workspace/perf-bench/prepare.sh /tmp/perf/wt-$n >/dev/null
cd /tmp/perf/wt-$n/apps/desktop >/dev/null
start=$(date +%s)
env -u SENTRY_AUTH_TOKEN NODE_ENV=production SKIP_ENV_VALIDATION=1 BENCH_OUT_DIR=/tmp/perf/out-$n \
  ./node_modules/.bin/vite build -c src/renderer/__bench__/bench.config.mts > /tmp/perf/build-$n.log 2>&1
code=$?
echo "$n exit=$code $(( $(date +%s)-start ))s"
