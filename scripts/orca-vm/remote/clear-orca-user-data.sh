# shellcheck shell=bash
# Runs inside the sandbox before a snapshot. A snapshot that holds Orca runtime
# data gives every sandbox booted from it the same pairing identity.
set -euo pipefail
exec 1>&2

raw_path="${ORCA_USER_DATA_PATH:-${XDG_CONFIG_HOME:-$HOME/.config}/orca}"
case "$raw_path" in
  /*) ;;
  *) echo "Refusing a relative Orca user-data path: $raw_path"; exit 1 ;;
esac
if [ -e "$raw_path" ]; then
  data_path="$(readlink -f "$raw_path")"
  home_path="$(readlink -f "$HOME")"
  [ -d "$data_path" ] || { echo "Orca user-data path is not a directory: $data_path"; exit 1; }
  case "$home_path/" in
    "$data_path"/*) echo "Refusing to delete an ancestor of home: $data_path"; exit 1 ;;
  esac
  [ "$(basename "$data_path")" = "orca" ] || { echo "Refusing an unexpected path: $data_path"; exit 1; }
  rm -rf "$data_path"
  echo "Removed Orca runtime data at $data_path"
fi
