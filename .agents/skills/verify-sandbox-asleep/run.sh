#!/usr/bin/env bash
# Model-checks Asleep.tla. Usage: ./run.sh [config]   (default Asleep.cfg)
set -euo pipefail
cd "$(dirname "$0")"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/tla"
JAR="$CACHE/tla2tools.jar"
if [ ! -s "$JAR" ]; then
  mkdir -p "$CACHE"
  curl -fsSL -o "$JAR.tmp" https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar
  mv "$JAR.tmp" "$JAR"
fi
CONFIG="${1:-Asleep.cfg}"
METADIR="$(mktemp -d)"
trap 'rm -rf "$METADIR"' EXIT
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers 1 -metadir "$METADIR" -config "$CONFIG" Asleep.tla
