#!/usr/bin/env bash
# Model-checks Lifecycle.tla.
# Usage: ./run.sh            every config; each must give its expected result
#        ./run.sh CONFIG     one config, full TLC output
set -euo pipefail
cd "$(dirname "$0")"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/tla"
JAR="$CACHE/tla2tools.jar"
if [ ! -s "$JAR" ]; then
  mkdir -p "$CACHE"
  curl -fsSL -o "$JAR.tmp" https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar
  mv "$JAR.tmp" "$JAR"
fi
tlc() {
  local meta; meta="$(mktemp -d)"
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto -metadir "$meta" -config "$1" Lifecycle.tla
  rm -rf "$meta"
}
if [ $# -gt 0 ]; then tlc "$1"; exit; fi

# config -> expected: "pass", or the one property it must fail.
EXPECT="
Lifecycle.cfg pass
Lifecycle-golden.cfg pass
Lifecycle-preview.cfg pass
Lifecycle-overlay.cfg pass
Lifecycle-overlay-leak.cfg NoLeak
Lifecycle-overlay-cleanup-prunes.cfg pass
Lifecycle-td-giveup-rule3.cfg pass
Lifecycle-safety-all.cfg pass
Lifecycle-a-delete-from-preview.cfg NoDeleteWhileUsed
Lifecycle-a-delete-from-preview-Isolation.cfg Isolation
Lifecycle-b-overlay-nopin.cfg NoDeleteWhileUsed
Lifecycle-c-drive-first.cfg NoDeleteWhileUsed
Lifecycle-d-no-rule3.cfg NoLeak
Lifecycle-e-fail-tears-down.cfg Retention
Lifecycle-rule3-boxes-only.cfg NoLeak
Lifecycle-no-rule1.cfg NoLeak
Lifecycle-no-rule2.cfg NoLeak
Lifecycle-no-grace.cfg Retention
Lifecycle-vercel-expiry.cfg NoDeleteWhileUsed
Lifecycle-td-giveup.cfg NoLeak
"
bad=0
printf '| Config | Expected | Actual | States |\n| --- | --- | --- | --- |\n'
while read -r cfg want; do
  [ -z "$cfg" ] && continue
  out="$(tlc "$cfg" 2>&1 || true)"
  if grep -q "No error has been found" <<<"$out"; then got=pass
  elif v="$(grep -oE '(Invariant|Action property) [A-Za-z]+ is violated' <<<"$out" | head -1)" && [ -n "$v" ]; then
    got="$(awk '{print $(NF-2)}' <<<"$v")"
  elif grep -q "Temporal properties were violated" <<<"$out"; then got=NoLeak
  else got="error: $(grep -m1 -E 'Error|Exception' <<<"$out" || echo none)"; fi
  states="$(grep -oE '[0-9]+ distinct states found' <<<"$out" | tail -1 | cut -d' ' -f1)"
  [ "$got" = "$want" ] || bad=1
  printf '| `%s` | %s | %s%s | %s |\n' "$cfg" "$want" "$got" "$([ "$got" = "$want" ] || echo ' (MISMATCH)')" "${states:-?}"
done <<<"$EXPECT"
exit $bad
