#!/usr/bin/env bash
set -uo pipefail

PARADEV_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=/dev/null
source "$PARADEV_SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$PARADEV_SCRIPT_DIR/lib/teardown/args.sh"
# shellcheck source=/dev/null
source "$PARADEV_SCRIPT_DIR/lib/teardown/steps.sh"
# shellcheck source=/dev/null
source "$PARADEV_SCRIPT_DIR/lib/teardown/main.sh"

teardown_main "$@"
