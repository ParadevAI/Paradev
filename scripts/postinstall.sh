#!/bin/bash
# Prevent infinite recursion during postinstall
# electron-builder install-app-deps can trigger nested bun installs
# which would re-run postinstall, spawning hundreds of processes

if [ -n "$SUPERSET_POSTINSTALL_RUNNING" ]; then
  exit 0
fi

export SUPERSET_POSTINSTALL_RUNNING=1

# Run sherif for workspace validation
sherif

# Materialize the compiled Lingui catalogs. They are generated, not committed,
# and turbo builds them for any task that goes through the graph — but a direct
# `bun run --filter=<pkg> typecheck` bypasses turbo, so a fresh clone would hit
# "Cannot find module '../locales/en/messages'". Non-fatal: a missing
# translation must fail a real build, not an install.
if ! bun run --filter=@superset/i18n build; then
  echo "postinstall: lingui compile failed; run 'bun run check:i18n' for details" >&2
fi

# GitHub CI runs multiple Bun install jobs that do not need desktop native rebuilds.
# Running electron-builder here can trigger nested Bun installs while the main
# install is still materializing packages, which has been flaky with native deps.
if [ -n "$CI" ]; then
  exit 0
fi

# Electron 43+ no longer downloads its binary in a postinstall script. The dev
# scripts (patch-dev-protocol, clean-launch-services) and the host-service e2e
# runner expect node_modules/electron/dist to exist, so fetch it here.
bun run --filter=@superset/desktop install:electron

# Electron 44's V8 headers need a newer compiler than Debian bookworm's
# default gcc 12 and clang 14, so cloud sandboxes build with clang-16.
if [ -z "${CC:-}" ] && command -v clang++-16 >/dev/null; then
  export CC=clang-16 CXX=clang++-16
fi

# Install native dependencies for desktop app
bun run --filter=@superset/desktop install:deps
