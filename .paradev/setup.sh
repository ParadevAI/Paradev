#!/usr/bin/env bash
set -uo pipefail

PARADEV_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=/dev/null
source "$PARADEV_SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$PARADEV_SCRIPT_DIR/lib/setup/args.sh"
# shellcheck source=/dev/null
source "$PARADEV_SCRIPT_DIR/lib/setup/steps.sh"
# shellcheck source=/dev/null
source "$PARADEV_SCRIPT_DIR/lib/setup/main.sh"

setup_main "$@"
