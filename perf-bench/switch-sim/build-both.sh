#!/usr/bin/env bash
set -e
cd "$1"
F1=apps/desktop/src/renderer/globals.css; F2=apps/desktop/src/renderer/index.tsx
F3='apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/components/TerminalRichInput/TerminalRichInput.tsx'
build() { (cd apps/desktop && env -u SENTRY_AUTH_TOKEN NODE_ENV=production SKIP_ENV_VALIDATION=1 BENCH_OUT_DIR=/tmp/perf-mac/out-$1 bun --bun ./node_modules/.bin/vite build -c src/renderer/__bench_switch__/bench.config.mts > /tmp/perf-mac/build-$1.log 2>&1); echo "built $1"; }
apps/desktop/src/renderer/__bench_switch__/prepare-compat.sh >/dev/null; build after
git diff -- "$F1" "$F2" "$F3" > /tmp/perf-mac/speed2.patch
git checkout -- "$F1" "$F2" "$F3"; mv apps/desktop/src/renderer/lib/overlayOpenClass /tmp/perf-mac/overlayOpenClass.bak
apps/desktop/src/renderer/__bench_switch__/prepare-compat.sh >/dev/null
build before || true
git apply /tmp/perf-mac/speed2.patch; mv /tmp/perf-mac/overlayOpenClass.bak apps/desktop/src/renderer/lib/overlayOpenClass
apps/desktop/src/renderer/__bench_switch__/prepare-compat.sh >/dev/null
git status --short | grep -v perf-bench
